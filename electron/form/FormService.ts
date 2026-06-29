import {
  PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFDropdown,
  PDFRadioGroup, PDFButton, PDFOptionList, PDFSignature,
  PDFName, PDFDict, PDFString, PDFRef,
} from 'pdf-lib';

/** 表单字段类型 */
export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'button' | 'optionList' | 'signature' | 'unknown';

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

/** 字段动作脚本 */
export interface FieldActionScripts {
  validate?: string;
  calculate?: string;
  format?: string;
  keystroke?: string;
}

/** 增强表单字段信息 */
export interface EnhancedFormFieldInfo extends FormFieldInfo {
  maxLength?: number;
  multiline?: boolean;
  actions?: FieldActionScripts;
}

/** XFA 检测结果 */
export interface XFADetectResult {
  hasXFA: boolean;
  warning?: string;
  fieldCount: number;
}

/**
 * 表单字段检测与填充服务（主进程端）
 * 使用 pdf-lib 的 PDFForm API 读取 AcroForm 字段
 * 支持 XFA 检测、增强字段信息、动作脚本提取
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
   * 检测 PDF 是否包含 XFA 表单
   */
  async detectXFA(pdfData: ArrayBuffer): Promise<XFADetectResult> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;

    // 查找 AcroForm 字典
    const trailer = context.trailerInfo;
    let acroFormRef: PDFRef | PDFDict | undefined;

    try {
      // 尝试从 catalog 获取 AcroForm
      const catalog = context.lookup(trailer.Root) as any;
      if (catalog?.get) {
        acroFormRef = catalog.get(PDFName.of('AcroForm'));
      }
    } catch {
      return { hasXFA: false, fieldCount: 0 };
    }

    if (!acroFormRef) {
      return { hasXFA: false, fieldCount: 0 };
    }

    const acroForm = context.lookup(acroFormRef) as any;
    if (!acroForm?.get) {
      return { hasXFA: false, fieldCount: 0 };
    }

    // 检查 XFA 条目
    const xfaEntry = acroForm.get(PDFName.of('XFA'));
    const hasXFA = !!xfaEntry;

    // 统计字段数
    let fieldCount = 0;
    try {
      const form = doc.getForm();
      fieldCount = form.getFields().length;
    } catch {
      // 无法读取字段
    }

    const result: XFADetectResult = { hasXFA, fieldCount };
    if (hasXFA) {
      result.warning = '此 PDF 包含 XFA 表单。XFA 是动态表单技术，pdf-lib 仅支持 AcroForm 静态表单。部分功能可能无法正常工作，建议使用 Adobe Acrobat 进行完整编辑。';
    }

    return result;
  }

  /**
   * 获取增强的表单字段详情（含页面、位置、验证等）
   */
  async getFormFieldDetails(pdfData: ArrayBuffer): Promise<EnhancedFormFieldInfo[]> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const form = doc.getForm();
    const pages = doc.getPages();
    const fields: EnhancedFormFieldInfo[] = [];

    try {
      const allFields = form.getFields();

      for (const field of allFields) {
        const name = field.getName();
        const baseInfo = this.extractFieldInfo(field, name);
        if (!baseInfo) continue;

        const enhanced: EnhancedFormFieldInfo = { ...baseInfo };

        // 提取额外属性
        const acroField = (field as any).acroField;
        if (acroField) {
          let flags = 0;
          // 检查 required 标志
          const ff = acroField.get(PDFName.of('Ff'));
          if (ff) {
            flags = (ff as any).value || Number(ff);
            enhanced.required = !!(flags & 0x2); // Required flag = bit 2
          }

          // 文本字段特有属性
          if (field instanceof PDFTextField) {
            const maxLen = acroField.get(PDFName.of('MaxLength'));
            if (maxLen) {
              enhanced.maxLength = (maxLen as any).value || Number(maxLen);
            }
            enhanced.multiline = !!(flags & 0x1000); // Multiline flag = bit 13
          }
        }

        // 查找字段所在页面和位置
        const pageInfo = this.findFieldPageAndRect(field, pages);
        if (pageInfo) {
          enhanced.page = pageInfo.page;
          enhanced.rect = pageInfo.rect;
        }

        // 提取动作脚本
        const actions = this.extractActionsFromField(field);
        if (actions && (actions.validate || actions.calculate || actions.format || actions.keystroke)) {
          enhanced.actions = actions;
        }

        fields.push(enhanced);
      }
    } catch {
      return [];
    }

    return fields;
  }

  /**
   * 提取字段的动作脚本（验证/计算/格式化/按键）
   */
  async extractFieldActions(pdfData: ArrayBuffer, fieldName: string): Promise<FieldActionScripts> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const form = doc.getForm();

    try {
      const field = form.getField(fieldName);
      return this.extractActionsFromField(field);
    } catch {
      return {};
    }
  }

  /**
   * 从字段中提取动作脚本
   */
  private extractActionsFromField(field: ReturnType<PDFForm['getFields']>[0]): FieldActionScripts {
    const scripts: FieldActionScripts = {};
    const acroField = (field as any).acroField as PDFDict | undefined;
    if (!acroField?.get) return scripts;

    // AA (Additional Actions) 字典
    const aa = acroField.get(PDFName.of('AA'));
    if (!aa) return scripts;

    // AA 可能是引用，需要查找
    let aaResolved: PDFDict | null = null;
    try {
      if (aa instanceof PDFDict) {
        aaResolved = aa;
      } else {
        // 尝试从 context 解析
        const context = (acroField as any).context;
        if (context?.lookup) {
          aaResolved = context.lookup(aa) as PDFDict;
        }
      }
    } catch { /* ignore */ }

    if (!aaResolved?.get) return scripts;

    // AA 字典中的动作键:
    // V = Validate, C = Calculate, F = Format, K = Keystroke
    const extractScript = (key: string): string | undefined => {
      const actionRef = aaResolved!.get(PDFName.of(key));
      if (!actionRef) return undefined;

      try {
        const context = (acroField as any).context;
        const action = context?.lookup ? context.lookup(actionRef) : actionRef;
        if (!action?.get) return undefined;

        // Action 字典中 S=JavaScript 时，JS 条目包含脚本
        const s = action.get(PDFName.of('S'));
        if (s && s.toString().includes('JavaScript')) {
          const js = action.get(PDFName.of('JS'));
          if (js) {
            if (js instanceof PDFString) return js.decodeText();
            // 可能是流对象
            if ((js as any).contents || (js as any).getContents) {
              const contents = (js as any).contents || (js as any).getContents();
              if (contents) return Buffer.from(contents).toString('utf-8');
            }
            return String(js);
          }
        }
      } catch { /* ignore */ }
      return undefined;
    };

    scripts.validate = extractScript('V');
    scripts.calculate = extractScript('C');
    scripts.format = extractScript('F');
    scripts.keystroke = extractScript('K');

    return scripts;
  }

  /**
   * 查找字段所在的页面和矩形区域
   */
  private findFieldPageAndRect(
    field: ReturnType<PDFForm['getFields']>[0],
    pages: ReturnType<PDFDocument['getPages']>,
  ): { page: number; rect: { x: number; y: number; width: number; height: number } } | null {
    try {
      const acroField = (field as any).acroField as PDFDict | undefined;
      if (!acroField?.get) return null;

      // 获取字段的 widget 注解引用
      const widgets = (field as any).widgets;
      if (!widgets || !Array.isArray(widgets) || widgets.length === 0) return null;

      const widget = widgets[0];
      const widgetDict = widget?.dict || widget;
      if (!widgetDict?.get) return null;

      // 获取矩形 [llx, lly, urx, ury]
      const rectArr = widgetDict.get(PDFName.of('Rect'));
      if (!rectArr) return null;

      const rectValues = (rectArr as any).asArray?.() || (rectArr as any).map?.((x: any) => x);
      if (!rectValues || rectValues.length < 4) return null;

      const nums = rectValues.map((v: any) => {
        const n = typeof v === 'number' ? v : (v.value !== undefined ? Number(v.value) : Number(v));
        return isNaN(n) ? 0 : n;
      });

      const [llx, lly, urx, ury] = nums;
      const rect = {
        x: Math.round(llx * 100) / 100,
        y: Math.round(lly * 100) / 100,
        width: Math.round((urx - llx) * 100) / 100,
        height: Math.round((ury - lly) * 100) / 100,
      };

      // 查找字段所在页面 - 通过 Parent 或 Page 引用
      const pageRef = widgetDict.get(PDFName.of('P'));
      if (pageRef) {
        for (let i = 0; i < pages.length; i++) {
          const pageNode = pages[i].node as any;
          if (pageRef === pageNode.ref || pageRef.toString() === pageNode.ref?.toString()) {
            return { page: i + 1, rect };
          }
        }
      }

      // 回退：通过矩形位置判断页面
      for (let i = 0; i < pages.length; i++) {
        const { width, height } = pages[i].getSize();
        if (llx >= 0 && lly >= 0 && urx <= width + 1 && ury <= height + 1) {
          return { page: i + 1, rect };
        }
      }

      return { page: 1, rect };
    } catch {
      return null;
    }
  }

  /**
   * 提取单个字段信息
   */
  private extractFieldInfo(
    field: ReturnType<PDFForm['getFields']>[0],
    name: string,
  ): FormFieldInfo | null {
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

    if (field instanceof PDFButton) {
      return {
        ...base,
        type: 'button',
        value: '',
      } as FormFieldInfo;
    }

    if (field instanceof PDFOptionList) {
      return {
        ...base,
        type: 'optionList',
        value: field.getSelected().join(', '),
        options: field.getOptions(),
      } as FormFieldInfo;
    }

    if (field instanceof PDFSignature) {
      return {
        ...base,
        type: 'signature',
        value: '',
      } as FormFieldInfo;
    }

    return {
      ...base,
      type: 'unknown',
      value: '',
    } as FormFieldInfo;
  }
}
