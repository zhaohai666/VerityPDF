import type { VerityProjectFile } from '@/types';
import { Logger, getVerityPath } from '@/utils';

const logger = new Logger('StorageService');

export class StorageService {
  /**
   * 保存 .verity 项目文件
   */
  async save(filePath: string, project: VerityProjectFile): Promise<boolean> {
    try {
      const verityPath = getVerityPath(filePath);
      const data = JSON.stringify(project, null, 2);
      const result = await window.verityAPI.saveFile(data, verityPath);
      if (result) {
        logger.info(`Project saved: ${verityPath}`);
      }
      return result;
    } catch (err) {
      logger.error('Failed to save project:', err);
      return false;
    }
  }

  /**
   * 加载 .verity 项目文件
   */
  async load(pdfPath: string): Promise<VerityProjectFile | null> {
    try {
      const verityPath = getVerityPath(pdfPath);
      const data = await window.verityAPI.readFile(verityPath);
      const text = new TextDecoder().decode(data);
      const project = JSON.parse(text) as VerityProjectFile;
      logger.info(`Project loaded: ${verityPath}`);
      return project;
    } catch {
      // .verity 文件不存在，正常情况
      logger.debug(`No .verity file found for: ${pdfPath}`);
      return null;
    }
  }

  /**
   * 检查 .verity 文件是否存在
   */
  async exists(pdfPath: string): Promise<boolean> {
    try {
      const verityPath = getVerityPath(pdfPath);
      await window.verityAPI.readFile(verityPath);
      return true;
    } catch {
      return false;
    }
  }
}
