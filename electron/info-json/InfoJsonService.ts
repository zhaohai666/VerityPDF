import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';

export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  level: number;
}

export interface AttachmentInfo {
  name: string;
  description: string;
  size: number;
  creationDate?: string;
  modificationDate?: string;
}

export interface PdfInfoJsonResult {
  info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  pageCount: number;
  bookmarks: BookmarkEntry[];
  attachments: AttachmentInfo[];
  fonts: string[];
  images: number;
  formFields: number;
}

export class InfoJsonService {
  async getInfoJson(pdfData: ArrayBuffer): Promise<PdfInfoJsonResult> {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    const info = this.extractInfo(pdfDoc);
    const metadata = this.extractMetadata(pdfDoc);
    const pageCount = pdfDoc.getPageCount();
    const bookmarks = this.extractBookmarks(pdfDoc);
    const attachments = this.extractAttachments(pdfDoc);
    const fonts = this.extractFonts(pdfDoc);
    const images = this.countImages(pdfDoc);
    const formFields = this.countFormFields(pdfDoc);

    return {
      info,
      metadata,
      pageCount,
      bookmarks,
      attachments,
      fonts,
      images,
      formFields,
    };
  }

  private extractInfo(pdfDoc: PDFDocument): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    try {
      const title = pdfDoc.getTitle();
      if (title) info.title = title;
    } catch {
      // Title not available
    }

    try {
      const author = pdfDoc.getAuthor();
      if (author) info.author = author;
    } catch {
      // Author not available
    }

    try {
      const subject = pdfDoc.getSubject();
      if (subject) info.subject = subject;
    } catch {
      // Subject not available
    }

    try {
      const keywords = pdfDoc.getKeywords();
      if (keywords) info.keywords = keywords;
    } catch {
      // Keywords not available
    }

    try {
      const creator = pdfDoc.getCreator();
      if (creator) info.creator = creator;
    } catch {
      // Creator not available
    }

    try {
      const producer = pdfDoc.getProducer();
      if (producer) info.producer = producer;
    } catch {
      // Producer not available
    }

    try {
      const creationDate = pdfDoc.getCreationDate();
      if (creationDate) info.creationDate = creationDate.toISOString();
    } catch {
      // Creation date not available
    }

    try {
      const modificationDate = pdfDoc.getModificationDate();
      if (modificationDate) info.modificationDate = modificationDate.toISOString();
    } catch {
      // Modification date not available
    }

    return info;
  }

  private extractMetadata(pdfDoc: PDFDocument): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    try {
      const pdfDocInfo = pdfDoc.context.lookup(PDFName.of('Info'));
      if (pdfDocInfo && pdfDocInfo instanceof PDFDict) {
        const entries = pdfDocInfo.entries();
        for (const [key, value] of entries) {
          metadata[key.toString()] = value.toString();
        }
      }
    } catch {
      // Metadata not available
    }

    return metadata;
  }

  private extractBookmarks(pdfDoc: PDFDocument): BookmarkEntry[] {
    const bookmarks: BookmarkEntry[] = [];

    try {
      const catalog = pdfDoc.context.lookup(PDFName.of('Catalog')) as PDFDict | undefined;
      if (!catalog) return bookmarks;

      const outlinesRef = catalog.get(PDFName.of('Outlines'));
      if (!outlinesRef) return bookmarks;

      const outlines = pdfDoc.context.lookup(outlinesRef) as PDFDict | undefined;
      if (!outlines) return bookmarks;

      const firstRef = outlines.get(PDFName.of('First'));
      if (!firstRef) return bookmarks;

      this.traverseBookmarks(pdfDoc, firstRef, bookmarks, 0);
    } catch {
      // Bookmarks not available
    }

    return bookmarks;
  }

  private traverseBookmarks(
    pdfDoc: PDFDocument,
    itemRef: unknown,
    bookmarks: BookmarkEntry[],
    level: number
  ): void {
    let currentRef = itemRef;

    while (currentRef) {
      try {
        const item = pdfDoc.context.lookup(currentRef as any) as PDFDict | undefined;
        if (!item) break;

        const titleObj = item.get(PDFName.of('Title'));
        const title = titleObj ? titleObj.toString().replace(/^\(|\)$/g, '') : '';

        let pageIndex = 0;
        const dest = item.get(PDFName.of('Dest'));
        const action = item.get(PDFName.of('Action'));

        if (dest) {
          pageIndex = this.resolveDestPageIndex(pdfDoc, dest);
        } else if (action) {
          pageIndex = this.resolveActionPageIndex(pdfDoc, action);
        }

        bookmarks.push({ title, pageIndex, level });

        const firstRef = item.get(PDFName.of('First'));
        if (firstRef) {
          this.traverseBookmarks(pdfDoc, firstRef, bookmarks, level + 1);
        }

        currentRef = item.get(PDFName.of('Next'));
      } catch {
        break;
      }
    }
  }

  private resolveDestPageIndex(pdfDoc: PDFDocument, dest: unknown): number {
    try {
      let pageRef: unknown = null;

      if (dest instanceof PDFArray) {
        pageRef = dest.get(0);
      } else if (typeof dest === 'string' || dest instanceof PDFName) {
        const names = pdfDoc.context.lookup(PDFName.of('Names')) as PDFDict | undefined;
        if (names) {
          const dests = names.get(PDFName.of('Dests'));
          if (dests) {
            const destsDict = pdfDoc.context.lookup(dests) as PDFDict | undefined;
            if (destsDict) {
              const namesArray = destsDict.get(PDFName.of('Names')) as PDFArray | undefined;
              if (namesArray) {
                for (let i = 0; i < namesArray.size(); i += 2) {
                  const name = namesArray.get(i);
                  if (name.toString() === dest.toString()) {
                    const value = namesArray.get(i + 1);
                    if (value instanceof PDFArray) {
                      pageRef = value.get(0);
                    }
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (pageRef) {
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          if (page.ref && page.ref.toString() === (pageRef as object).toString()) {
            return i;
          }
        }
      }
    } catch {
      // Could not resolve page index
    }

    return 0;
  }

  private resolveActionPageIndex(pdfDoc: PDFDocument, action: unknown): number {
    try {
      const actionDict = pdfDoc.context.lookup(action as any) as PDFDict | undefined;
      if (!actionDict) return 0;

      const s = actionDict.get(PDFName.of('S'));
      if (s && s.toString() === '/GoTo') {
        const dest = actionDict.get(PDFName.of('D'));
        if (dest) {
          return this.resolveDestPageIndex(pdfDoc, dest);
        }
      }
    } catch {
      // Could not resolve action page index
    }

    return 0;
  }

  private extractAttachments(pdfDoc: PDFDocument): AttachmentInfo[] {
    const attachments: AttachmentInfo[] = [];

    try {
      const names = pdfDoc.context.lookup(PDFName.of('Names')) as PDFDict | undefined;
      if (!names) return attachments;

      const embeddedFiles = names.get(PDFName.of('EmbeddedFiles'));
      if (!embeddedFiles) return attachments;

      const embeddedFilesDict = pdfDoc.context.lookup(embeddedFiles) as PDFDict | undefined;
      if (!embeddedFilesDict) return attachments;

      const namesArray = embeddedFilesDict.get(PDFName.of('Names')) as PDFArray | undefined;
      if (!namesArray) return attachments;

      for (let i = 0; i < namesArray.size(); i += 2) {
        try {
          const name = namesArray.get(i);
          const fileSpecRef = namesArray.get(i + 1);
          const fileSpec = pdfDoc.context.lookup(fileSpecRef) as PDFDict | undefined;

          if (!fileSpec) continue;

          const fileName = name.toString().replace(/^\/|^\(|\)$/g, '');
          const desc = fileSpec.get(PDFName.of('Desc'));
          const description = desc ? desc.toString().replace(/^\(|\)$/g, '') : '';

          const ef = fileSpec.get(PDFName.of('EF')) as PDFDict | undefined;
          if (!ef) continue;

          const fileRef = ef.get(PDFName.of('F'));
          const fileStream = pdfDoc.context.lookup(fileRef) as PDFDict | undefined;
          if (!fileStream) continue;

          const size = fileStream.get(PDFName.of('Length'));
          const fileSize = size ? parseInt(size.toString(), 10) : 0;

          const attachment: AttachmentInfo = {
            name: fileName,
            description,
            size: fileSize,
          };

          const creationDate = fileSpec.get(PDFName.of('CreationDate'));
          if (creationDate) {
            attachment.creationDate = creationDate.toString().replace(/^\(|\)$/g, '');
          }

          const modDate = fileSpec.get(PDFName.of('ModDate'));
          if (modDate) {
            attachment.modificationDate = modDate.toString().replace(/^\(|\)$/g, '');
          }

          attachments.push(attachment);
        } catch {
          // Skip this attachment
        }
      }
    } catch {
      // Attachments not available
    }

    return attachments;
  }

  private extractFonts(pdfDoc: PDFDocument): string[] {
    const fonts: string[] = [];
    const fontSet = new Set<string>();

    try {
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        try {
          const resources = page.node.get(PDFName.of('Resources')) as PDFDict | undefined;
          if (!resources) continue;

          const fontDict = resources.get(PDFName.of('Font')) as PDFDict | undefined;
          if (!fontDict) continue;

          const entries = fontDict.entries();
          for (const [key] of entries) {
            const fontName = key.toString().replace(/^\//, '');
            if (!fontSet.has(fontName)) {
              fontSet.add(fontName);
              fonts.push(fontName);
            }
          }
        } catch {
          // Skip this page's fonts
        }
      }
    } catch {
      // Fonts not available
    }

    return fonts;
  }

  private countImages(pdfDoc: PDFDocument): number {
    let count = 0;

    try {
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        try {
          const resources = page.node.get(PDFName.of('Resources')) as PDFDict | undefined;
          if (!resources) continue;

          const xObjectDict = resources.get(PDFName.of('XObject')) as PDFDict | undefined;
          if (!xObjectDict) continue;

          const entries = xObjectDict.entries();
          for (const [, value] of entries) {
            try {
              const xObject = pdfDoc.context.lookup(value) as PDFDict | undefined;
              if (!xObject) continue;

              const subtype = xObject.get(PDFName.of('Subtype'));
              if (subtype && subtype.toString() === '/Image') {
                count++;
              }
            } catch {
              // Skip this XObject
            }
          }
        } catch {
          // Skip this page's images
        }
      }
    } catch {
      // Images not available
    }

    return count;
  }

  private countFormFields(pdfDoc: PDFDocument): number {
    try {
      const form = pdfDoc.getForm();
      return form.getFields().length;
    } catch {
      return 0;
    }
  }
}
