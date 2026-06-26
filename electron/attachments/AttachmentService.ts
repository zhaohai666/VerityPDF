import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFString,
  PDFHexString,
  PDFRawStream,
} from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface AttachmentInfo {
  name: string;
  description: string;
  size: number;
  creationDate?: string;
  modificationDate?: string;
}

export interface AddAttachmentOptions {
  name: string;
  data: string;
  description?: string;
}

export class AttachmentService {
  /**
   * List all file attachments embedded in the PDF.
   */
  async listAttachments(pdfData: ArrayBuffer): Promise<AttachmentInfo[]> {
    const pdfDoc = await PDFDocument.load(pdfData);
    const entries = this.getEmbeddedFileEntries(pdfDoc);

    return entries.map(([, fileSpec]) => {
      const name =
        this.resolveString(fileSpec, 'UF') ??
        this.resolveString(fileSpec, 'F') ??
        '';
      const description = this.resolveString(fileSpec, 'Desc') ?? '';

      let size = 0;
      const sizeObj = fileSpec.lookup(PDFName.of('Size'));
      if (sizeObj) {
        size = Number(sizeObj.toString());
      } else {
        // Fall back to Size inside the embedded file stream's Params dict
        const efDict = fileSpec.lookup(PDFName.of('EF')) as PDFDict | undefined;
        if (efDict) {
          const stream = efDict.lookup(PDFName.of('F')) as PDFRawStream | undefined;
          if (stream?.dict) {
            const params = stream.dict.lookup(PDFName.of('Params')) as PDFDict | undefined;
            if (params) {
              const paramSize = params.lookup(PDFName.of('Size'));
              if (paramSize) {
                size = Number(paramSize.toString());
              }
            }
          }
        }
      }

      const creationDate = this.resolveString(fileSpec, 'CreationDate');
      const modificationDate = this.resolveString(fileSpec, 'ModDate');

      const info: AttachmentInfo = { name, description, size };
      if (creationDate) info.creationDate = creationDate;
      if (modificationDate) info.modificationDate = modificationDate;
      return info;
    });
  }

  /**
   * Add a new file attachment to the PDF and return the modified PDF bytes.
   */
  async addAttachment(
    pdfData: ArrayBuffer,
    options: AddAttachmentOptions
  ): Promise<ArrayBuffer> {
    const pdfDoc = await PDFDocument.load(pdfData);
    const context = pdfDoc.context;

    // Decode the base64 payload into raw bytes
    const fileBytes = Buffer.from(options.data, 'base64');

    // -- Build the embedded-file stream --
    const streamDict = PDFDict.withContext(context);
    streamDict.set(PDFName.of('Type'), PDFName.of('EmbeddedFile'));
    const stream = PDFRawStream.of(streamDict, fileBytes);
    const streamRef = context.register(stream);

    // -- Build the EF (embedded-file) dictionary --
    const efDict = PDFDict.withContext(context);
    efDict.set(PDFName.of('F'), streamRef);
    const efRef = context.register(efDict);

    // -- Build the file-specification dictionary --
    const fileSpec = PDFDict.withContext(context);
    fileSpec.set(PDFName.of('Type'), PDFName.of('Filespec'));
    fileSpec.set(PDFName.of('F'), PDFString.of(options.name));
    fileSpec.set(PDFName.of('EF'), efRef);
    if (options.description) {
      fileSpec.set(PDFName.of('Desc'), PDFString.of(options.description));
    }
    const fileSpecRef = context.register(fileSpec);

    // Insert into the EmbeddedFiles name tree (creating it when absent)
    this.addToNameTree(pdfDoc, context, options.name, fileSpecRef);

    const saved = await pdfDoc.save();
    return saved.buffer.slice(
      saved.byteOffset,
      saved.byteOffset + saved.byteLength
    ) as ArrayBuffer;
  }

  /**
   * Extract attachment files from the PDF and write them to disk.
   * When `names` is provided only those attachments are extracted.
   */
  async extractAttachments(
    pdfData: ArrayBuffer,
    outputDir: string,
    names?: string[]
  ): Promise<string[]> {
    const pdfDoc = await PDFDocument.load(pdfData);
    const entries = this.getEmbeddedFileEntries(pdfDoc);

    fs.mkdirSync(outputDir, { recursive: true });

    const savedPaths: string[] = [];

    for (const [entryName, fileSpec] of entries) {
      if (names && !names.includes(entryName)) {
        continue;
      }

      const efDict = fileSpec.lookup(PDFName.of('EF')) as PDFDict | undefined;
      if (!efDict) continue;

      const stream = efDict.lookup(PDFName.of('F')) as PDFRawStream | undefined;
      if (!stream) continue;

      const data = stream.contents;
      const outputPath = path.join(outputDir, entryName);
      fs.writeFileSync(outputPath, data);
      savedPaths.push(outputPath);
    }

    return savedPaths;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Navigate catalog -> Names -> EmbeddedFiles and return every
   * [name, fileSpecDict] pair found in the name tree.
   */
  private getEmbeddedFileEntries(
    pdfDoc: PDFDocument
  ): Array<[string, PDFDict]> {
    const context = pdfDoc.context;
    const catalog = pdfDoc.catalog;

    const namesDict = catalog.lookup(PDFName.of('Names')) as PDFDict | undefined;
    if (!namesDict) return [];

    const embeddedFiles = namesDict.lookup(
      PDFName.of('EmbeddedFiles')
    ) as PDFDict | undefined;
    if (!embeddedFiles) return [];

    return this.walkNameTree(embeddedFiles, context);
  }

  /**
   * Recursively walk a PDF name tree, collecting leaf entries.
   */
  private walkNameTree(
    node: PDFDict,
    context: any
  ): Array<[string, PDFDict]> {
    const results: Array<[string, PDFDict]> = [];

    // Intermediate node — recurse into kids
    const kids = node.lookup(PDFName.of('Kids')) as PDFArray | undefined;
    if (kids) {
      for (let i = 0; i < kids.size(); i++) {
        const kid = context.lookup(kids.get(i)) as PDFDict | undefined;
        if (kid) {
          results.push(...this.walkNameTree(kid, context));
        }
      }
    }

    // Leaf node — read name/value pairs
    const namesArr = node.lookup(PDFName.of('Names')) as PDFArray | undefined;
    if (namesArr) {
      for (let i = 0; i < namesArr.size(); i += 2) {
        const nameObj = namesArr.get(i);
        const valueObj = namesArr.get(i + 1);

        let nameStr: string;
        if (nameObj instanceof PDFHexString) {
          nameStr = nameObj.decodeText();
        } else if (nameObj instanceof PDFString) {
          nameStr = nameObj.decodeText();
        } else {
          nameStr = nameObj.toString();
        }

        const resolved = context.lookup(valueObj) as PDFDict | undefined;
        if (resolved) {
          results.push([nameStr, resolved]);
        }
      }
    }

    return results;
  }

  /**
   * Safely read a string value from a dictionary, handling both
   * PDFString and PDFHexString representations.
   */
  private resolveString(dict: PDFDict, key: string): string | undefined {
    const obj = dict.lookup(PDFName.of(key));
    if (!obj) return undefined;
    if (obj instanceof PDFString || obj instanceof PDFHexString) {
      return obj.decodeText();
    }
    return undefined;
  }

  /**
   * Ensure the catalog contains an EmbeddedFiles name tree and append
   * a new [name, fileSpecRef] entry to it.
   */
  private addToNameTree(
    pdfDoc: PDFDocument,
    context: any,
    name: string,
    fileSpecRef: any
  ): void {
    const catalog = pdfDoc.catalog;

    // Get or create the Names dictionary on the catalog
    let namesDict = catalog.lookup(PDFName.of('Names')) as PDFDict | undefined;
    if (!namesDict) {
      namesDict = PDFDict.withContext(context);
      const namesRef = context.register(namesDict);
      catalog.set(PDFName.of('Names'), namesRef);
    }

    // Get or create the EmbeddedFiles name-tree root
    let efRoot = namesDict.lookup(
      PDFName.of('EmbeddedFiles')
    ) as PDFDict | undefined;
    if (!efRoot) {
      const namesArray = PDFArray.withContext(context);
      namesArray.push(PDFString.of(name));
      namesArray.push(fileSpecRef);

      efRoot = PDFDict.withContext(context);
      efRoot.set(PDFName.of('Names'), namesArray);
      const efRootRef = context.register(efRoot);
      namesDict.set(PDFName.of('EmbeddedFiles'), efRootRef);
      return;
    }

    // Tree already exists — drill down to a leaf and append
    this.appendLeaf(efRoot, context, name, fileSpecRef);
  }

  /**
   * Walk down to the rightmost leaf of a name tree and push a new
   * [name, value] pair into its Names array.
   */
  private appendLeaf(
    node: PDFDict,
    context: any,
    name: string,
    fileSpecRef: any
  ): void {
    const kids = node.lookup(PDFName.of('Kids')) as PDFArray | undefined;
    if (kids) {
      const lastKid = context.lookup(kids.get(kids.size() - 1)) as PDFDict;
      this.appendLeaf(lastKid, context, name, fileSpecRef);
    } else {
      let namesArray = node.lookup(PDFName.of('Names')) as PDFArray | undefined;
      if (!namesArray) {
        namesArray = PDFArray.withContext(context);
        const arrRef = context.register(namesArray);
        node.set(PDFName.of('Names'), arrRef);
      }
      namesArray.push(PDFString.of(name));
      namesArray.push(fileSpecRef);
    }
  }
}
