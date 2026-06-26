import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString, PDFHexString } from 'pdf-lib';

export interface JsEntry {
  /** Location description: e.g. "Names/JavaScript", "Page 0 AA", "Widget /Btn1" */
  location: string;
  /** The JavaScript source code */
  code: string;
  /** Type: 'document' = document-level, 'page' = page action, 'field' = form field action, 'named' = named destination */
  type: 'document' | 'page' | 'field' | 'named' | 'annotation';
}

export interface ShowJsResult {
  scripts: JsEntry[];
  totalCount: number;
  pagesScanned: number;
}

export class ShowJsService {
  /**
   * Extract all JavaScript from the PDF
   */
  async extractJavaScript(pdfData: ArrayBuffer): Promise<ShowJsResult> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const scripts: JsEntry[] = [];
    const context = pdfDoc.context;

    // 1. Document-level JavaScript (Names/JavaScript name tree)
    this.extractFromNameTree(pdfDoc, scripts);

    // 2. Document Additional Actions (AA dictionary on catalog)
    this.extractFromAA(pdfDoc.catalog, 'Document Catalog AA', 'document', scripts, context);

    // 3. Page-level actions
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      this.extractFromAA(page.node, `Page ${i} AA`, 'page', scripts, context);

      // 4. Annotation-level actions (form fields, links, etc.)
      const annots = page.node.get(PDFName.of('Annots'));
      if (annots) {
        const annotsArray = context.lookup(annots) as PDFArray | undefined;
        if (annotsArray && annotsArray instanceof PDFArray) {
          const count = annotsArray.size();
          for (let j = 0; j < count; j++) {
            const annotRef = annotsArray.get(j);
            const annot = context.lookup(annotRef) as PDFDict | undefined;
            if (annot && annot instanceof PDFDict) {
              // Get field name if available
              const t = annot.get(PDFName.of('T'));
              const fieldName = t ? this.extractString(t) : `Annot_${j}`;
              this.extractFromAA(annot, `Page ${i} Annotation "${fieldName}"`, 'field', scripts, context);
            }
          }
        }
      }
    }

    return {
      scripts,
      totalCount: scripts.length,
      pagesScanned: pageCount,
    };
  }

  /**
   * Extract JavaScript from the Names/JavaScript name tree
   */
  private extractFromNameTree(pdfDoc: PDFDocument, scripts: JsEntry[]): void {
    const context = pdfDoc.context;
    const catalog = pdfDoc.catalog;

    // Check Names dictionary
    const names = catalog.get(PDFName.of('Names'));
    if (!names) return;

    const namesDict = context.lookup(names) as PDFDict | undefined;
    if (!namesDict || !(namesDict instanceof PDFDict)) return;

    // JavaScript name tree
    const jsTree = namesDict.get(PDFName.of('JavaScript'));
    if (!jsTree) return;

    const jsDict = context.lookup(jsTree) as PDFDict | undefined;
    if (!jsDict || !(jsDict instanceof PDFDict)) return;

    // Walk the name tree
    this.walkNameTree(jsDict, 'Names/JavaScript', 'named', scripts, context);
  }

  /**
   * Recursively walk a name tree to find JS entries
   */
  private walkNameTree(
    node: PDFDict,
    location: string,
    type: JsEntry['type'],
    scripts: JsEntry[],
    context: any,
    visited: Set<string> = new Set()
  ): void {
    // Prevent circular references
    const nodeKey = node.toString();
    if (visited.has(nodeKey)) return;
    visited.add(nodeKey);

    // Check for Names array (leaf node)
    const namesArray = node.get(PDFName.of('Names'));
    if (namesArray) {
      const arr = context.lookup(namesArray) as PDFArray | undefined;
      if (arr && arr instanceof PDFArray) {
        // Names array alternates: [name1, value1, name2, value2, ...]
        const size = arr.size();
        for (let i = 0; i < size - 1; i += 2) {
          const nameObj = arr.get(i);
          const valueRef = arr.get(i + 1);
          const name = this.extractString(nameObj);
          const value = context.lookup(valueRef);

          if (value && value instanceof PDFDict) {
            // The value is a file spec or action dict
            const js = value.get(PDFName.of('JS'));
            if (js) {
              const jsValue = context.lookup(js);
              const code = this.extractString(jsValue);
              if (code) {
                scripts.push({
                  location: `${location}/${name}`,
                  code,
                  type,
                });
              }
            }

            // Also check for A (Action) entry
            const action = value.get(PDFName.of('A'));
            if (action) {
              const actionDict = context.lookup(action) as PDFDict | undefined;
              if (actionDict && actionDict instanceof PDFDict) {
                this.extractActionJs(actionDict, `${location}/${name}`, type, scripts, context);
              }
            }
          }
        }
      }
    }

    // Check for Kids array (intermediate node)
    const kids = node.get(PDFName.of('Kids'));
    if (kids) {
      const kidsArr = context.lookup(kids) as PDFArray | undefined;
      if (kidsArr && kidsArr instanceof PDFArray) {
        const count = kidsArr.size();
        for (let i = 0; i < count; i++) {
          const kidRef = kidsArr.get(i);
          const kid = context.lookup(kidRef) as PDFDict | undefined;
          if (kid && kid instanceof PDFDict) {
            this.walkNameTree(kid, `${location}/Kids[${i}]`, type, scripts, context, visited);
          }
        }
      }
    }
  }

  /**
   * Extract JavaScript from an Additional Actions (AA) dictionary
   */
  private extractFromAA(
    dict: PDFDict,
    location: string,
    type: JsEntry['type'],
    scripts: JsEntry[],
    context: any
  ): void {
    const aa = dict.get(PDFName.of('AA'));
    if (!aa) return;

    const aaDict = context.lookup(aa) as PDFDict | undefined;
    if (!aaDict || !(aaDict instanceof PDFDict)) return;

    // AA dictionary keys: various trigger events
    // Common keys: K (keystroke), F (format), V (validate), C (calculate)
    // Document: WC (WillClose), WS (WillSave), DS (DidSave), WP (WillPrint), DP (DidPrint)
    // Page: O (Open), C (Close)
    const aaEntries = aaDict instanceof PDFDict ? (aaDict as any).dict : undefined;
    if (!aaEntries) return;

    for (const [key, value] of aaEntries) {
      const triggerName = key instanceof PDFName ? key.toString() : String(key);
      const actionDict = context.lookup(value) as PDFDict | undefined;
      
      if (actionDict && actionDict instanceof PDFDict) {
        this.extractActionJs(actionDict, `${location} [${triggerName}]`, type, scripts, context);
      }
    }
  }

  /**
   * Extract JS from an Action dictionary
   */
  private extractActionJs(
    action: PDFDict,
    location: string,
    type: JsEntry['type'],
    scripts: JsEntry[],
    context: any
  ): void {
    // Check if it's a JavaScript action (S = /JavaScript)
    const s = action.get(PDFName.of('S'));
    if (!s) return;

    const sName = context.lookup(s);
    const sStr = this.extractString(sName);
    if (sStr !== 'JavaScript') return;

    // Get the JS code
    const js = action.get(PDFName.of('JS'));
    if (js) {
      const jsValue = context.lookup(js);
      const code = this.extractString(jsValue);
      if (code) {
        scripts.push({ location, code, type });
      }
    }
  }

  /**
   * Extract string from PDF object (PDFString, PDFHexString, or PDFName)
   */
  private extractString(obj: unknown): string {
    if (!obj) return '';
    if (obj instanceof PDFString || obj instanceof PDFHexString) {
      return (obj as any).decodeText?.() || (obj as any).value || String(obj);
    }
    if (obj instanceof PDFName) {
      return (obj as any).value || (obj as any).encodedName || String(obj);
    }
    if (typeof obj === 'string') return obj;
    // Try to get contents from stream
    if ('contents' in (obj as any)) {
      return Buffer.from((obj as any).contents).toString('utf-8');
    }
    return String(obj);
  }
}
