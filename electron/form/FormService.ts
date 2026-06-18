import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';

/** 表单字段类型 */
export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unknown';

/** 表单字段信息 */
export interface FormFieldInfo {
  name: string;
  type: FormFieldType;
  value: string | boolean;
  options?: string[];  // dropdown/radio 的选项
  readOnly: boolean;
  required: boolean;
  page: number;
  rect?: { x: number; y: number; width: number; height: number };
}

/**
 * 表单字段检测与填充服务（主进程端）
 * 使用 pdf-lib 的 PDFForm API 读取 AcroForm 字段
 */
export class FormService {
  /**
   * 检测 PDF 中的所有表单字段
   */
  async detectFields(pdfData: ArrayBuffer): Promise<FormFieldInfo[]> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const form = doc.getForm();
    const fields: FormFieldInfo[] = [];

    try {
      const allFields = form.getFields();

      for (const field of allFields) {
        const name = field.getName();
        const info = this.extractFieldInfo(field, name);
        if (info) {
          fields.push(info);
        }
      }
    } catch {
      // 文档没有表单字段
      return [];
    }

    return fields;
  }

  /**
   * 填充表单字段
   */
  async fillFields(
    pdfData: ArrayBuffer,
    values: Record<string, string | boolean>
  ): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const form = doc.getForm();

    for (const [name, value] of Object.entries(values)) {
      try {
        const field = form.getField(name);
        if (typeof value === 'boolean') {
          // CheckBox 或 RadioButton
          if (field instanceof PDFCheckBox) {
            if (value) field.check(); else field.uncheck();
          } else if (field instanceof PDFRadioGroup) {
            field.select(value.toString());
          }
        } else if (typeof value === 'string') {
          if (field instanceof PDFTextField) {
            field.setText(value);
          } else if (field instanceof PDFDropdown) {
            field.select(value);
          }
        }
      } catch {
        // 字段不存在或类型不匹配，跳过
      }
    }

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 扁平化表单（将表单字段转换为静态内容）
   */
  async flattenForm(pdfData: ArrayBuffer): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const form = doc.getForm();
    form.flatten();

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * 提取单个字段信息
   */
  private extractFieldInfo(field: ReturnType<PDFForm['getFields']>[0], name: string): FormFieldInfo | null {
    const base: Partial<FormFieldInfo> = {
      name,
      page: 1,
      readOnly: field.isReadOnly(),
      required: false,
    };

    if (field instanceof PDFTextField) {
      return {
        ...base,
        type: 'text',
        value: field.getText() || '',
      } as FormFieldInfo;
    }

    if (field instanceof PDFCheckBox) {
      return {
        ...base,
        type: 'checkbox',
        value: field.isChecked(),
      } as FormFieldInfo;
    }

    if (field instanceof PDFDropdown) {
      return {
        ...base,
        type: 'dropdown',
        value: field.getSelected().join(', '),
        options: field.getOptions(),
      } as FormFieldInfo;
    }

    if (field instanceof PDFRadioGroup) {
      return {
        ...base,
        type: 'radio',
        value: field.getSelected() || '',
        options: field.getOptions(),
      } as FormFieldInfo;
    }

    return {
      ...base,
      type: 'unknown',
      value: '',
    } as FormFieldInfo;
  }
}
