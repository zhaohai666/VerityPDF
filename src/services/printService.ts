import { BrowserWindow, dialog } from 'electron';
import { writeFile } from 'fs/promises';

/**
 * Print service for Electron
 */
export class PrintService {
  /**
   * Print current window
   */
  static async printWindow(win: BrowserWindow) {
    try {
      const result = await win.webContents.printToPDF({
        landscape: false,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
      });

      // Ask user where to save
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Save PDF',
        defaultPath: 'document.pdf',
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] },
        ],
      });

      if (filePath) {
        await writeFile(filePath, result);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Print failed:', error);
      return false;
    }
  }

  /**
   * Print to specific printer
   */
  static async printToPrinter(win: BrowserWindow) {
    try {
      const options = {
        silent: false,
        printBackground: true,
        color: true,
      };
      return win.webContents.print(options);
    } catch (error) {
      console.error('Print to printer failed:', error);
      return false;
    }
  }
}