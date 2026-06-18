/** 表单字段类型 */
export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unknown';

/** 表单字段信息 */
export interface FormFieldInfo {
  name: string;
  type: FormFieldType;
  value: string | boolean;
  options?: string[];
  readOnly: boolean;
  required: boolean;
  page: number;
  rect?: { x: number; y: number; width: number; height: number };
}

/**
 * 表单服务（渲染进程端）
 * 通过 IPC 调用主进程的 FormService
 */
export class FormServiceRenderer {
  /**
   * 检测 PDF 中的表单字段
   */
  async detectFields(pdfData: ArrayBuffer): Promise<FormFieldInfo[]> {
    const base64 = this.arrayBufferToBase64(pdfData);
    return window.verityAPI.detectFormFields(base64);
  }

  /**
   * 填充表单字段
   */
  async fillFields(
    pdfData: ArrayBuffer,
    values: Record<string, string | boolean>
  ): Promise<ArrayBuffer> {
    const base64 = this.arrayBufferToBase64(pdfData);
    return window.verityAPI.fillFormFields(base64, values);
  }

  /**
   * 扁平化表单
   */
  async flattenForm(pdfData: ArrayBuffer): Promise<ArrayBuffer> {
    const base64 = this.arrayBufferToBase64(pdfData);
    return window.verityAPI.flattenForm(base64);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
