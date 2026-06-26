import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

export interface SanitizeOptions {
  removeMetadata: boolean;
  removeJavaScript: boolean;
  removeEmbeddedFiles: boolean;
  removeXmp: boolean;
  removeDocumentInfo: boolean;
}

export interface SanitizeResult {
  pdfData: ArrayBuffer;
  removedItems: string[];
  cleanedCount: number;
}

export class SanitizeService {
  /**
   * Sanitizes a PDF by removing specified elements.
   * 
   * Note: pdf-lib has limited support for low-level PDF manipulation.
   * Some operations (especially JavaScript removal) are best-effort and
   * may not catch all instances (e.g., JavaScript in OpenAction, AdditionalActions,
   * or form field actions). For comprehensive sanitization, consider using
   * a dedicated PDF library like poppler or muPDF.
   */
  async sanitize(
    pdfData: ArrayBuffer,
    options: SanitizeOptions
  ): Promise<SanitizeResult> {
    const pdfDoc = await PDFDocument.load(pdfData);
    const removedItems: string[] = [];

    // Remove document metadata (Title, Author, Subject, etc.)
    if (options.removeMetadata) {
      pdfDoc.setTitle(null as any);
      pdfDoc.setAuthor(null as any);
      pdfDoc.setSubject(null as any);
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');
      removedItems.push('Document metadata (Title, Author, Subject, Keywords, Producer, Creator)');
    }

    // Remove JavaScript from Names tree
    // Limitation: This only removes JavaScript from the Names tree.
    // JavaScript can also exist in OpenAction, AdditionalActions, and form fields,
    // which would require traversing the entire document structure.
    if (options.removeJavaScript) {
      try {
        const catalog = pdfDoc.catalog;
        const namesDict = catalog.get(PDFName.of('Names'));
        
        if (namesDict instanceof PDFDict) {
          const jsEntry = namesDict.get(PDFName.of('JavaScript'));
          if (jsEntry) {
            namesDict.delete(PDFName.of('JavaScript'));
            removedItems.push('JavaScript actions from Names tree');
          }
        }
      } catch (error) {
        console.warn('Could not fully remove JavaScript:', error);
      }
    }

    // Remove embedded files from Names tree
    if (options.removeEmbeddedFiles) {
      try {
        const catalog = pdfDoc.catalog;
        const namesDict = catalog.get(PDFName.of('Names'));
        
        if (namesDict instanceof PDFDict) {
          const embeddedFilesEntry = namesDict.get(PDFName.of('EmbeddedFiles'));
          if (embeddedFilesEntry) {
            namesDict.delete(PDFName.of('EmbeddedFiles'));
            removedItems.push('Embedded files from Names tree');
          }
        }
      } catch (error) {
        console.warn('Could not remove embedded files:', error);
      }
    }

    // Remove XMP metadata stream from catalog
    if (options.removeXmp) {
      try {
        const catalog = pdfDoc.catalog;
        const metadataRef = catalog.get(PDFName.of('Metadata'));
        
        if (metadataRef) {
          catalog.delete(PDFName.of('Metadata'));
          removedItems.push('XMP metadata stream');
        }
      } catch (error) {
        console.warn('Could not remove XMP metadata:', error);
      }
    }

    // Remove document info dictionary from catalog
    if (options.removeDocumentInfo) {
      try {
        const catalog = pdfDoc.catalog;
        const infoRef = catalog.get(PDFName.of('Info'));
        
        if (infoRef) {
          catalog.delete(PDFName.of('Info'));
          removedItems.push('Document Info dictionary');
        }
      } catch (error) {
        console.warn('Could not remove document info:', error);
      }
    }

    // Save the cleaned PDF
    const cleanedPdfBytes = await pdfDoc.save();
    
    return {
      pdfData: cleanedPdfBytes.buffer as ArrayBuffer,
      removedItems,
      cleanedCount: removedItems.length,
    };
  }
}
