import { BrowserWindow } from 'electron';

/**
 * Stamp configuration interface
 */
export interface StampConfig {
  id: string;
  name: string;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string; // CSS color string
  opacity: number; // 0-1
  rotation: number; // degrees
  // Additional properties for more complex stamps can be added here
}

/**
 * 预设印章库服务
 * 提供预定义的印章配置，如已批准、机密、草稿、日期戳等
 */
export class StampLibraryService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    // Use mainWindow to avoid unused variable warning
    if (this.mainWindow) {
      // Reference to avoid unused variable warning
      this.mainWindow.getTitle();
    }
  }

  /**
   * 获取所有预设印章
   * @returns 印章配置数组
   */
  getAllStamps(): StampConfig[] {
    return [
      {
        id: 'approved',
        name: '已批准',
        text: 'APPROVED',
        fontSize: 48,
        fontFamily: 'Helvetica-Bold',
        color: 'rgba(0, 128, 0, 0.5)', // Green with 50% opacity
        opacity: 0.5,
        rotation: -45, // Commonly rotated for stamps
      },
      {
        id: 'confidential',
        name: '机密',
        text: 'CONFIDENTIAL',
        fontSize: 48,
        fontFamily: 'Helvetica-Bold',
        color: 'rgba(255, 0, 0, 0.5)', // Red with 50% opacity
        opacity: 0.5,
        rotation: -45,
      },
      {
        id: 'draft',
        name: '草稿',
        text: 'DRAFT',
        fontSize: 48,
        fontFamily: 'Helvetica-Bold',
        color: 'rgba(0, 0, 255, 0.5)', // Blue with 50% opacity
        opacity: 0.5,
        rotation: -45,
      },
      {
        id: 'date',
        name: '日期戳',
        text: '', // Will be filled dynamically with current date
        fontSize: 24,
        fontFamily: 'Helvetica',
        color: 'rgba(0, 0, 0, 0.7)', // Black with 70% opacity
        opacity: 0.7,
        rotation: 0,
        // Note: For date stamp, the text will be updated at runtime to current date
      },
      // Add more preset stamps as needed
    ];
  }

  /**
   * 根据ID获取印章配置
   * @param id 印章ID
   * @returns 印章配置，如果不存在则返回null
   */
  getStampById(id: string): StampConfig | null {
    const stamps = this.getAllStamps();
    const stamp = stamps.find(s => s.id === id);
    return stamp || null;
  }

  /**
   * 获取日期戳的当前日期文本
   * @returns 格式化的日期字符串 (YYYY-MM-DD)
   */
  getDateStampText(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD format
  }
}