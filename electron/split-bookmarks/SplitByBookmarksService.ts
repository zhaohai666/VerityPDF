import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFRef,
  PDFString,
  PDFHexString,
} from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface SplitByBookmarksOptions {
  level: 'top' | 'all';
  outputDir: string;
}

export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  level: number;
}

export interface SplitByBookmarksResult {
  outputFiles: string[];
  bookmarks: BookmarkEntry[];
  splitCount: number;
}

export class SplitByBookmarksService {
  /**
   * Split a PDF document by its bookmark (outline) entries.
   *
   * Each bookmark defines the start of a page range that extends to the next
   * bookmark's start page (or the end of the document).  For every range a new
   * PDF is created and written to `options.outputDir`.
   */
  async splitByBookmarks(
    pdfData: ArrayBuffer,
    options: SplitByBookmarksOptions,
  ): Promise<SplitByBookmarksResult> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const totalPages = pdfDoc.getPageCount();

    // 1. Extract bookmarks from the PDF Outline tree
    const allBookmarks = this.extractBookmarks(pdfDoc);

    if (allBookmarks.length === 0) {
      return { outputFiles: [], bookmarks: [], splitCount: 0 };
    }

    // 2. Filter by level when the caller only wants top-level bookmarks
    const bookmarks =
      options.level === 'top'
        ? this.filterTopLevelBookmarks(allBookmarks)
        : allBookmarks;

    if (bookmarks.length === 0) {
      return { outputFiles: [], bookmarks: [], splitCount: 0 };
    }

    // 3. Ensure the output directory exists
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    // 4. Build page ranges and create one PDF per range
    const outputFiles: string[] = [];
    const ranges = this.buildPageRanges(bookmarks, totalPages);

    for (let i = 0; i < ranges.length; i++) {
      const { startPage, endPage, title } = ranges[i];

      // Skip bookmarks that point beyond the document
      if (startPage >= totalPages) {
        continue;
      }

      const clampedEnd = Math.min(endPage, totalPages - 1);
      const pageCount = clampedEnd - startPage + 1;

      if (pageCount <= 0) {
        continue;
      }

      const newDoc = await PDFDocument.create();
      const pageIndices = Array.from(
        { length: pageCount },
        (_, idx) => startPage + idx,
      );
      const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => newDoc.addPage(page));

      const savedBytes = await newDoc.save();
      const fileName = this.sanitizeFileName(title) + '.pdf';
      const filePath = path.join(options.outputDir, fileName);
      fs.writeFileSync(filePath, savedBytes);
      outputFiles.push(filePath);
    }

    return {
      outputFiles,
      bookmarks,
      splitCount: outputFiles.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Bookmark extraction
  // ---------------------------------------------------------------------------

  /**
   * Walk the PDF Outline tree and return a flat list of bookmarks ordered by
   * their position in the outline hierarchy.
   */
  private extractBookmarks(pdfDoc: PDFDocument): BookmarkEntry[] {
    const bookmarks: BookmarkEntry[] = [];

    const catalog = pdfDoc.catalog;
    const outlinesRef = catalog.get(PDFName.of('Outlines'));
    if (!outlinesRef) {
      return bookmarks;
    }

    const outlinesDict = pdfDoc.context.lookup(outlinesRef) as
      | PDFDict
      | undefined;
    if (!outlinesDict || !(outlinesDict instanceof PDFDict)) {
      return bookmarks;
    }

    const firstItemRef = outlinesDict.get(PDFName.of('First'));
    if (!firstItemRef) {
      return bookmarks;
    }

    this.traverseOutlineItems(
      pdfDoc,
      firstItemRef as PDFRef | PDFDict,
      0,
      bookmarks,
      new Set<string>(),
    );

    // Sort by page index so that range-building works correctly even when the
    // outline tree is not strictly ordered.
    bookmarks.sort((a, b) => a.pageIndex - b.pageIndex);

    return bookmarks;
  }

  /**
   * Recursively traverse outline items following First (children) and Next
   * (siblings) links.
   */
  private traverseOutlineItems(
    pdfDoc: PDFDocument,
    firstRef: PDFRef | PDFDict,
    level: number,
    bookmarks: BookmarkEntry[],
    visited: Set<string>,
  ): void {
    let current: PDFDict | undefined =
      firstRef instanceof PDFDict
        ? firstRef
        : (pdfDoc.context.lookup(firstRef) as PDFDict | undefined);

    while (current && current instanceof PDFDict) {
      // Guard against circular references
      const refKey =
        firstRef instanceof PDFRef
          ? firstRef.toString()
          : current.toString();
      if (visited.has(refKey)) {
        break;
      }
      visited.add(refKey);

      // Extract the bookmark title
      const titlePdfStr = current.lookup(PDFName.of('Title'));
      const title = this.extractTextString(titlePdfStr);

      // Resolve the destination to a zero-based page index
      const pageIndex = this.resolveDestToPageIndex(pdfDoc, current);

      if (title && pageIndex >= 0) {
        bookmarks.push({ title, pageIndex, level });
      }

      // Recurse into children
      const childFirstRef = current.get(PDFName.of('First'));
      if (childFirstRef) {
        this.traverseOutlineItems(
          pdfDoc,
          childFirstRef as PDFRef | PDFDict,
          level + 1,
          bookmarks,
          visited,
        );
      }

      // Move to next sibling
      const nextRef = current.get(PDFName.of('Next'));
      if (!nextRef) {
        break;
      }
      current =
        nextRef instanceof PDFDict
          ? nextRef
          : (pdfDoc.context.lookup(nextRef) as PDFDict | undefined);
    }
  }

  // ---------------------------------------------------------------------------
  // Destination resolution
  // ---------------------------------------------------------------------------

  /**
   * Given an outline item dictionary, resolve its destination to a zero-based
   * page index.  Returns -1 when the page cannot be determined.
   */
  private resolveDestToPageIndex(
    pdfDoc: PDFDocument,
    outlineItem: PDFDict,
  ): number {
    // Try the explicit Dest entry first
    let destObj = outlineItem.get(PDFName.of('Dest'));

    // Fall back to the Action -> GoTo -> D entry
    if (!destObj) {
      const actionRef = outlineItem.get(PDFName.of('A'));
      if (actionRef) {
        const actionDict =
          actionRef instanceof PDFDict
            ? actionRef
            : (pdfDoc.context.lookup(actionRef) as PDFDict | undefined);
        if (actionDict) {
          const sName = actionDict.get(PDFName.of('S'));
          if (sName instanceof PDFName && sName.toString() === '/GoTo') {
            destObj = actionDict.get(PDFName.of('D'));
          }
        }
      }
    }

    if (!destObj) {
      return -1;
    }

    // Dereference if necessary
    let dest =
      destObj instanceof PDFRef
        ? (pdfDoc.context.lookup(destObj) as
            | PDFArray
            | PDFName
            | PDFHexString
            | PDFString
            | undefined)
        : destObj;

    // Case 1: Explicit destination — an array whose first element is a page ref
    if (dest instanceof PDFArray) {
      return this.resolveExplicitDest(pdfDoc, dest);
    }

    // Case 2: Named destination — a name or string that must be resolved
    if (
      dest instanceof PDFName ||
      dest instanceof PDFHexString ||
      dest instanceof PDFString
    ) {
      return this.resolveNamedDest(pdfDoc, dest);
    }

    return -1;
  }

  /**
   * Resolve an explicit destination array (e.g. [pageRef /Fit]).
   */
  private resolveExplicitDest(
    pdfDoc: PDFDocument,
    destArray: PDFArray,
  ): number {
    if (destArray.size() === 0) {
      return -1;
    }

    const pageRef = destArray.get(0);
    if (!pageRef) {
      return -1;
    }

    return this.findPageIndexByRef(pdfDoc, pageRef);
  }

  /**
   * Resolve a named destination by looking it up in the document's name tree
   * or the legacy Dests dictionary.
   */
  private resolveNamedDest(
    pdfDoc: PDFDocument,
    nameOrStr: PDFName | PDFHexString | PDFString,
  ): number {
    const destName = this.extractTextString(nameOrStr);
    if (!destName) {
      return -1;
    }

    const catalog = pdfDoc.catalog;

    // Strategy 1: Modern Names -> Dests name tree
    const namesRef = catalog.get(PDFName.of('Names'));
    if (namesRef) {
      const namesDict =
        namesRef instanceof PDFDict
          ? namesRef
          : (pdfDoc.context.lookup(namesRef) as PDFDict | undefined);
      if (namesDict) {
        const destsTreeRef = namesDict.get(PDFName.of('Dests'));
        if (destsTreeRef) {
          const destsTree =
            destsTreeRef instanceof PDFDict
              ? destsTreeRef
              : (pdfDoc.context.lookup(destsTreeRef) as
                  | PDFDict
                  | undefined);
          if (destsTree) {
            const pageRef = this.lookupNameInTree(
              pdfDoc,
              destsTree,
              destName,
            );
            if (pageRef) {
              return this.findPageIndexByRef(pdfDoc, pageRef);
            }
          }
        }
      }
    }

    // Strategy 2: Legacy Dests dictionary
    const destsRef = catalog.get(PDFName.of('Dests'));
    if (destsRef) {
      const destsDict =
        destsRef instanceof PDFDict
          ? destsRef
          : (pdfDoc.context.lookup(destsRef) as PDFDict | undefined);
      if (destsDict) {
        const destEntry = destsDict.get(PDFName.of(destName));
        if (destEntry) {
          const resolved =
            destEntry instanceof PDFRef
              ? (pdfDoc.context.lookup(destEntry) as
                  | PDFArray
                  | PDFDict
                  | undefined)
              : destEntry;

          if (resolved instanceof PDFArray) {
            return this.resolveExplicitDest(pdfDoc, resolved);
          }

          // Some legacy dests point to a page dict via a dict with a D entry
          if (resolved instanceof PDFDict) {
            const dEntry = resolved.get(PDFName.of('D'));
            if (dEntry) {
              const dResolved =
                dEntry instanceof PDFRef
                  ? (pdfDoc.context.lookup(dEntry) as PDFArray | undefined)
                  : dEntry;
              if (dResolved instanceof PDFArray) {
                return this.resolveExplicitDest(pdfDoc, dResolved);
              }
            }
          }
        }
      }
    }

    return -1;
  }

  /**
   * Search a PDF name tree for `targetName` and return the associated value
   * (typically a page reference or a destination array whose first element is
   * a page reference).
   */
  private lookupNameInTree(
    pdfDoc: PDFDocument,
    nameTree: PDFDict,
    targetName: string,
  ): PDFRef | PDFDict | undefined {
    // Leaf node: has a Names array of [key value key value ...] pairs
    const namesRef = nameTree.get(PDFName.of('Names'));
    if (namesRef) {
      const namesArray =
        namesRef instanceof PDFArray
          ? namesRef
          : (pdfDoc.context.lookup(namesRef) as PDFArray | undefined);
      if (namesArray) {
        const len = namesArray.size();
        for (let i = 0; i + 1 < len; i += 2) {
          const keyObj = namesArray.get(i);
          const key = this.extractTextString(keyObj);
          if (key === targetName) {
            const valObj = namesArray.get(i + 1);
            if (valObj instanceof PDFRef) {
              const resolved = pdfDoc.context.lookup(valObj);
              // If it resolves to an array it is an explicit dest — return the
              // first element (the page ref).
              if (resolved instanceof PDFArray && resolved.size() > 0) {
                return resolved.get(0) as PDFRef | PDFDict;
              }
              return valObj;
            }
            if (valObj instanceof PDFDict) {
              return valObj;
            }
          }
        }
      }
    }

    // Interior node: has Kids and possibly Limits
    const kidsRef = nameTree.get(PDFName.of('Kids'));
    if (kidsRef) {
      const kidsArray =
        kidsRef instanceof PDFArray
          ? kidsRef
          : (pdfDoc.context.lookup(kidsRef) as PDFArray | undefined);
      if (kidsArray) {
        for (let i = 0; i < kidsArray.size(); i++) {
          const kidRef = kidsArray.get(i);
          const kidDict =
            kidRef instanceof PDFDict
              ? kidRef
              : (pdfDoc.context.lookup(kidRef) as PDFDict | undefined);
          if (!kidDict) {
            continue;
          }

          // Optional: use Limits to prune the search
          const limitsRef = kidDict.get(PDFName.of('Limits'));
          if (limitsRef) {
            const limitsArray =
              limitsRef instanceof PDFArray
                ? limitsRef
                : (pdfDoc.context.lookup(limitsRef) as
                    | PDFArray
                    | undefined);
            if (limitsArray && limitsArray.size() >= 2) {
              const lower = this.extractTextString(limitsArray.get(0));
              const upper = this.extractTextString(limitsArray.get(1));
              if (targetName < lower || targetName > upper) {
                continue;
              }
            }
          }

          const result = this.lookupNameInTree(pdfDoc, kidDict, targetName);
          if (result) {
            return result;
          }
        }
      }
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Page index lookup
  // ---------------------------------------------------------------------------

  /**
   * Find the zero-based index of a page given its indirect reference (or the
   * reference itself).  Returns -1 when the page cannot be found.
   */
  private findPageIndexByRef(
    pdfDoc: PDFDocument,
    pageRef: PDFRef | PDFDict | object,
  ): number {
    let targetRef: PDFRef;

    if (pageRef instanceof PDFRef) {
      targetRef = pageRef;
    } else {
      // The object might be a direct page dict — try to find its ref via the
      // page list.
      const totalPages = pdfDoc.getPageCount();
      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.getPage(i);
        if (page.ref === (pageRef as any).ref) {
          return i;
        }
      }
      return -1;
    }

    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      const page = pdfDoc.getPage(i);
      if (page.ref.toString() === targetRef.toString()) {
        return i;
      }
    }

    return -1;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Keep only bookmarks whose level equals the minimum level found in the list
   * (i.e. the top-level bookmarks).
   */
  private filterTopLevelBookmarks(
    bookmarks: BookmarkEntry[],
  ): BookmarkEntry[] {
    if (bookmarks.length === 0) {
      return bookmarks;
    }
    const minLevel = Math.min(...bookmarks.map((b) => b.level));
    return bookmarks.filter((b) => b.level === minLevel);
  }

  /**
   * Given a sorted list of bookmarks and the total page count, produce an array
   * of page ranges.  Each range spans from one bookmark's page to the page
   * before the next bookmark's page (or the last page of the document).
   */
  private buildPageRanges(
    bookmarks: BookmarkEntry[],
    totalPages: number,
  ): { startPage: number; endPage: number; title: string }[] {
    const ranges: {
      startPage: number;
      endPage: number;
      title: string;
    }[] = [];

    for (let i = 0; i < bookmarks.length; i++) {
      const startPage = bookmarks[i].pageIndex;
      const endPage =
        i + 1 < bookmarks.length
          ? bookmarks[i + 1].pageIndex - 1
          : totalPages - 1;

      if (startPage <= endPage && startPage >= 0) {
        ranges.push({
          startPage,
          endPage,
          title: bookmarks[i].title,
        });
      }
    }

    return ranges;
  }

  /**
   * Extract a plain string from a PDFString, PDFHexString, or PDFName.
   */
  private extractTextString(
    pdfObj:
      | PDFString
      | PDFHexString
      | PDFName
      | object
      | undefined
      | null,
  ): string {
    if (!pdfObj) {
      return '';
    }

    if (pdfObj instanceof PDFString) {
      return pdfObj.decodeText();
    }

    if (pdfObj instanceof PDFHexString) {
      return pdfObj.decodeText();
    }

    if (pdfObj instanceof PDFName) {
      // PDFName.toString() includes the leading '/'
      const encoded = pdfObj.toString();
      return encoded.startsWith('/') ? encoded.substring(1) : encoded;
    }

    return '';
  }

  /**
   * Sanitize a bookmark title so it can be safely used as a file name.
   */
  private sanitizeFileName(title: string): string {
    // Remove or replace characters that are invalid in file names
    let sanitized = title
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // illegal chars
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim();

    // Ensure the name is not empty after sanitization
    if (sanitized.length === 0) {
      sanitized = 'Untitled';
    }

    // Truncate excessively long names
    const MAX_LENGTH = 100;
    if (sanitized.length > MAX_LENGTH) {
      sanitized = sanitized.substring(0, MAX_LENGTH).trim();
    }

    return sanitized;
  }
}
