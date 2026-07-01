import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFRef } from 'pdf-lib';

/** 书签条目 */
export interface BookmarkItem {
  title: string;
  /** 目标页面索引 (0-based) */
  pageIndex: number;
  /** 层级深度 (0 = 顶级) */
  level: number;
  /** 目标缩放模式 */
  zoom?: 'fit' | 'fitH' | 'fitV' | 'xyz';
  /** 子书签 */
  children?: BookmarkItem[];
}

/** 书签编辑操作 */
export interface BookmarkEdit {
  /** 操作类型 */
  action: 'add' | 'delete' | 'edit' | 'reorder';
  /** 目标书签路径 (如 [0, 1, 2] 表示第1个书签的第2个子书签的第3个子书签) */
  path?: number[];
  /** 新书签标题 (add/edit 时使用) */
  title?: string;
  /** 目标页面索引 (add/edit 时使用) */
  pageIndex?: number;
  /** 目标缩放模式 */
  zoom?: 'fit' | 'fitH' | 'fitV' | 'xyz';
  /** 添加位置: 'before' | 'after' | 'child' (add 时使用) */
  position?: 'before' | 'after' | 'child';
  /** 新排序顺序 (reorder 时使用，为新的子书签索引顺序) */
  newOrder?: number[];
  /** 作为子书签添加时的父路径 */
  parentPath?: number[];
}

/**
 * PDF 书签编辑服务
 * 支持新增/删除/编辑/重排书签
 */
export class BookmarkEditService {
  /**
   * 获取 PDF 中所有书签（树形结构）
   */
  async getBookmarks(pdfData: ArrayBuffer): Promise<BookmarkItem[]> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    return this.extractBookmarks(doc);
  }

  /**
   * 执行书签编辑操作
   */
  async editBookmarks(pdfData: ArrayBuffer, edit: BookmarkEdit): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

    switch (edit.action) {
      case 'add':
        return this.addBookmark(doc, edit);
      case 'delete':
        return this.deleteBookmark(doc, edit);
      case 'edit':
        return this.updateBookmark(doc, edit);
      case 'reorder':
        return this.reorderBookmarks(doc, edit);
      default:
        throw new Error(`不支持的书签操作: ${edit.action}`);
    }
  }

  /**
   * 批量设置书签（替换所有现有书签）
   */
  async setBookmarks(pdfData: ArrayBuffer, bookmarks: BookmarkItem[]): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = doc.context;
    const pages = doc.getPages();

    // Remove existing outlines
    doc.catalog.delete(PDFName.of('Outlines'));

    if (bookmarks.length === 0) {
      const bytes = await doc.save();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    // Create new outline tree
    const { firstRef, lastRef } = this.buildOutlineTree(context, pages, bookmarks);

    // Create Outlines dict
    const outlinesDict = context.obj({
      Type: 'Outlines',
      Count: bookmarks.length,
    }) as PDFDict;
    outlinesDict.set(PDFName.of('First'), firstRef);
    outlinesDict.set(PDFName.of('Last'), lastRef);

    doc.catalog.set(PDFName.of('Outlines'), outlinesDict);

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  // ---- Private methods ----

  private extractBookmarks(doc: PDFDocument): BookmarkItem[] {
    const catalog = doc.catalog;
    const outlinesRef = catalog.get(PDFName.of('Outlines'));
    if (!outlinesRef) return [];

    const context = doc.context;
    const outlinesDict = (outlinesRef instanceof PDFDict ? outlinesRef : context.lookup(outlinesRef)) as PDFDict;
    if (!outlinesDict || !(outlinesDict instanceof PDFDict)) return [];

    const firstItemRef = outlinesDict.get(PDFName.of('First'));
    if (!firstItemRef) return [];

    const result: BookmarkItem[] = [];
    this.traverseOutline(doc, firstItemRef as PDFRef | PDFDict, 0, result);
    return result;
  }

  private traverseOutline(doc: PDFDocument, itemRef: PDFRef | PDFDict, level: number, result: BookmarkItem[]): void {
    const context = doc.context;
    const item = (itemRef instanceof PDFDict ? itemRef : context.lookup(itemRef)) as PDFDict;
    if (!item || !(item instanceof PDFDict)) return;

    const titleObj = item.get(PDFName.of('Title'));
    const title = titleObj instanceof PDFString ? titleObj.decodeText() : String(titleObj).replace(/^\//, '');

    const pageIndex = this.resolveDestToPageIndex(doc, item);

    result.push({ title, pageIndex, level });

    // Process children
    const firstChild = item.get(PDFName.of('First'));
    if (firstChild) {
      this.traverseOutline(doc, firstChild as PDFRef | PDFDict, level + 1, result);
    }

    // Process next sibling
    const next = item.get(PDFName.of('Next'));
    if (next) {
      this.traverseOutline(doc, next as PDFRef | PDFDict, level, result);
    }
  }

  private resolveDestToPageIndex(doc: PDFDocument, item: PDFDict): number {
    const context = doc.context;

    // Check Dest first
    const destObj = item.get(PDFName.of('Dest'));
    if (destObj) {
      if (destObj instanceof PDFArray && destObj.size() > 0) {
        const pageRef = destObj.get(0);
        if (pageRef instanceof PDFRef) {
          return this.findPageIndexByRef(doc, pageRef);
        }
      }
    }

    // Check Action with D (GoTo)
    const actionObj = item.get(PDFName.of('A'));
    if (actionObj) {
      const actionDict = (actionObj instanceof PDFDict ? actionObj : context.lookup(actionObj)) as PDFDict;
      if (actionDict) {
        const s = actionDict.get(PDFName.of('S'));
        if (s && s.toString() === '/GoTo') {
          const d = actionDict.get(PDFName.of('D'));
          if (d instanceof PDFArray && d.size() > 0) {
            const pageRef = d.get(0);
            if (pageRef instanceof PDFRef) {
              return this.findPageIndexByRef(doc, pageRef);
            }
          }
        }
      }
    }

    return -1;
  }

  private findPageIndexByRef(doc: PDFDocument, pageRef: PDFRef): number {
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].ref.toString() === pageRef.toString()) return i;
    }
    return -1;
  }

  private buildOutlineTree(
    context: any,
    pages: any[],
    bookmarks: BookmarkItem[],
    parentRef?: PDFRef
  ): { firstRef: PDFRef; lastRef: PDFRef } {
    let firstRef: PDFRef | null = null;
    let lastRef: PDFRef | null = null;
    let prevRef: PDFRef | null = null;

    for (let i = 0; i < bookmarks.length; i++) {
      const bm = bookmarks[i];
      const page = pages[bm.pageIndex] || pages[0];

      const zoomName = bm.zoom || 'fit';
      const zoomMap: Record<string, string> = { fit: 'Fit', fitH: 'FitH', fitV: 'FitV', xyz: 'XYZ' };
      const destArray = context.obj([page.ref, PDFName.of(zoomMap[zoomName] || 'Fit')]);

      const itemDict = context.obj({
        Title: PDFString.of(bm.title),
      }) as PDFDict;
      itemDict.set(PDFName.of('Dest'), destArray);

      // Set parent
      if (parentRef) {
        itemDict.set(PDFName.of('Parent'), parentRef);
      }

      // Set Prev
      if (prevRef) {
        itemDict.set(PDFName.of('Prev'), prevRef);
      }

      // Handle children
      if (bm.children && bm.children.length > 0) {
        // Register itemDict first to get a ref for parentRef
        const itemRefForChildren = context.register(itemDict);
        const { firstRef: childFirst, lastRef: childLast } = this.buildOutlineTree(context, pages, bm.children, itemRefForChildren);
        itemDict.set(PDFName.of('First'), childFirst);
        itemDict.set(PDFName.of('Last'), childLast);
        itemDict.set(PDFName.of('Count'), PDFName.of(String(bm.children.length)));
      }

      const itemRef = context.register(itemDict);

      // Set Next on previous item
      if (prevRef) {
        const prevDict = context.lookup(prevRef) as PDFDict;
        if (prevDict) prevDict.set(PDFName.of('Next'), itemRef);
      }

      if (!firstRef) firstRef = itemRef;
      lastRef = itemRef;
      prevRef = itemRef;
    }

    return { firstRef: firstRef!, lastRef: lastRef! };
  }

  private async addBookmark(doc: PDFDocument, edit: BookmarkEdit): Promise<ArrayBuffer> {
    const context = doc.context;
    const pages = doc.getPages();

    const pageIndex = edit.pageIndex ?? 0;
    const page = pages[pageIndex] || pages[0];
    const title = edit.title || 'Untitled';

    const zoomName = edit.zoom || 'fit';
    const zoomMap: Record<string, string> = { fit: 'Fit', fitH: 'FitH', fitV: 'FitV', xyz: 'XYZ' };
    const destArray = context.obj([page.ref, PDFName.of(zoomMap[zoomName] || 'Fit')]);

    const newItemDict = context.obj({
      Title: PDFString.of(title),
    }) as PDFDict;
    newItemDict.set(PDFName.of('Dest'), destArray);

    const newItemRef = context.register(newItemDict);

    // Get or create Outlines
    let outlinesDict = doc.catalog.get(PDFName.of('Outlines'));
    if (!outlinesDict) {
      outlinesDict = context.obj({
        Type: 'Outlines',
        Count: 0,
      }) as PDFDict;
      doc.catalog.set(PDFName.of('Outlines'), outlinesDict);
    }

    const outlinesDictObj = (outlinesDict instanceof PDFDict ? outlinesDict : context.lookup(outlinesDict)) as PDFDict;

    if (edit.parentPath && edit.parentPath.length > 0) {
      // Add as child of specified parent
      const parentItem = this.findOutlineItemByPath(doc, edit.parentPath);
      if (!parentItem) throw new Error('未找到父书签');
      const parentDict = (parentItem instanceof PDFDict ? parentItem : context.lookup(parentItem)) as PDFDict;

      const existingFirst = parentDict.get(PDFName.of('First'));
      if (!existingFirst) {
        parentDict.set(PDFName.of('First'), newItemRef);
        parentDict.set(PDFName.of('Last'), newItemRef);
        newItemDict.set(PDFName.of('Parent'), parentItem instanceof PDFRef ? parentItem : context.register(parentDict));
      } else {
        // Add as last child
        let lastChildRef = parentDict.get(PDFName.of('Last'));
        if (lastChildRef) {
          const lastChild = (lastChildRef instanceof PDFDict ? lastChildRef : context.lookup(lastChildRef)) as PDFDict;
          lastChild.set(PDFName.of('Next'), newItemRef);
          newItemDict.set(PDFName.of('Prev'), lastChildRef instanceof PDFRef ? lastChildRef : context.register(lastChild));
        }
        parentDict.set(PDFName.of('Last'), newItemRef);
        newItemDict.set(PDFName.of('Parent'), parentItem instanceof PDFRef ? parentItem : context.register(parentDict));
      }

      // Update count
      const count = parentDict.get(PDFName.of('Count'));
      const countVal = count ? parseInt(count.toString().replace(/^\//, '')) || 0 : 0;
      parentDict.set(PDFName.of('Count'), PDFName.of(String(countVal + 1)));
    } else {
      // Add at top level
      const existingFirst = outlinesDictObj.get(PDFName.of('First'));
      if (!existingFirst) {
        outlinesDictObj.set(PDFName.of('First'), newItemRef);
        outlinesDictObj.set(PDFName.of('Last'), newItemRef);
      } else {
        if (edit.position === 'before') {
          const firstDict = (existingFirst instanceof PDFDict ? existingFirst : context.lookup(existingFirst)) as PDFDict;
          firstDict.set(PDFName.of('Prev'), newItemRef);
          newItemDict.set(PDFName.of('Next'), existingFirst instanceof PDFRef ? existingFirst : context.register(firstDict));
          outlinesDictObj.set(PDFName.of('First'), newItemRef);
        } else {
          // Add after last
          const lastRef = outlinesDictObj.get(PDFName.of('Last'));
          if (lastRef) {
            const lastDict = (lastRef instanceof PDFDict ? lastRef : context.lookup(lastRef)) as PDFDict;
            lastDict.set(PDFName.of('Next'), newItemRef);
            newItemDict.set(PDFName.of('Prev'), lastRef instanceof PDFRef ? lastRef : context.register(lastDict));
          }
          outlinesDictObj.set(PDFName.of('Last'), newItemRef);
        }
      }

      const count = outlinesDictObj.get(PDFName.of('Count'));
      const countVal = count ? parseInt(count.toString().replace(/^\//, '')) || 0 : 0;
      outlinesDictObj.set(PDFName.of('Count'), PDFName.of(String(countVal + 1)));
    }

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private async deleteBookmark(doc: PDFDocument, edit: BookmarkEdit): Promise<ArrayBuffer> {
    if (!edit.path || edit.path.length === 0) throw new Error('需要指定要删除的书签路径');

    const context = doc.context;
    const itemRef = this.findOutlineItemByPath(doc, edit.path);
    if (!itemRef) throw new Error('未找到要删除的书签');

    const itemDict = (itemRef instanceof PDFDict ? itemRef : context.lookup(itemRef)) as PDFDict;

    // Unlink from siblings
    const prevRef = itemDict.get(PDFName.of('Prev'));
    const nextRef = itemDict.get(PDFName.of('Next'));
    const parentRef = itemDict.get(PDFName.of('Parent'));

    if (prevRef) {
      const prevDict = (prevRef instanceof PDFDict ? prevRef : context.lookup(prevRef)) as PDFDict;
      if (nextRef) {
        prevDict.set(PDFName.of('Next'), nextRef);
      } else {
        prevDict.delete(PDFName.of('Next'));
      }
    }

    if (nextRef) {
      const nextDict = (nextRef instanceof PDFDict ? nextRef : context.lookup(nextRef)) as PDFDict;
      if (prevRef) {
        nextDict.set(PDFName.of('Prev'), prevRef);
      } else {
        nextDict.delete(PDFName.of('Prev'));
      }
    }

    // Update parent
    if (parentRef) {
      const parentDict = (parentRef instanceof PDFDict ? parentRef : context.lookup(parentRef)) as PDFDict;
      if (!prevRef) parentDict.set(PDFName.of('First'), nextRef || PDFName.of('null'));
      if (!nextRef) parentDict.set(PDFName.of('Last'), prevRef || PDFName.of('null'));
      const count = parentDict.get(PDFName.of('Count'));
      const countVal = count ? parseInt(count.toString().replace(/^\//, '')) || 0 : 0;
      parentDict.set(PDFName.of('Count'), PDFName.of(String(Math.max(0, countVal - 1))));
    }

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private async updateBookmark(doc: PDFDocument, edit: BookmarkEdit): Promise<ArrayBuffer> {
    if (!edit.path || edit.path.length === 0) throw new Error('需要指定要编辑的书签路径');

    const context = doc.context;
    const itemRef = this.findOutlineItemByPath(doc, edit.path);
    if (!itemRef) throw new Error('未找到要编辑的书签');

    const itemDict = (itemRef instanceof PDFDict ? itemRef : context.lookup(itemRef)) as PDFDict;

    // Update title
    if (edit.title !== undefined) {
      itemDict.set(PDFName.of('Title'), PDFString.of(edit.title));
    }

    // Update destination page
    if (edit.pageIndex !== undefined) {
      const pages = doc.getPages();
      const page = pages[edit.pageIndex];
      if (!page) throw new Error(`目标页面不存在: ${edit.pageIndex}`);

      const zoomName = edit.zoom || 'fit';
      const zoomMap: Record<string, string> = { fit: 'Fit', fitH: 'FitH', fitV: 'FitV', xyz: 'XYZ' };
      const destArray = context.obj([page.ref, PDFName.of(zoomMap[zoomName] || 'Fit')]);
      itemDict.set(PDFName.of('Dest'), destArray);
      // Remove Action if we're setting Dest directly
      itemDict.delete(PDFName.of('A'));
    }

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private async reorderBookmarks(doc: PDFDocument, edit: BookmarkEdit): Promise<ArrayBuffer> {
    // For reorder, we extract all bookmarks, reorder, and rebuild the tree
    const bookmarks = this.extractBookmarks(doc);

    if (!edit.newOrder || edit.newOrder.length === 0) {
      throw new Error('需要提供新的排序顺序 newOrder');
    }

    // Reorder top-level bookmarks
    const reordered: BookmarkItem[] = [];
    for (const idx of edit.newOrder) {
      if (idx >= 0 && idx < bookmarks.length) {
        reordered.push(bookmarks[idx]);
      }
    }

    // Use setBookmarks logic to rebuild
    const context = doc.context;
    const pages = doc.getPages();

    doc.catalog.delete(PDFName.of('Outlines'));

    if (reordered.length === 0) {
      const bytes = await doc.save();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    const { firstRef, lastRef } = this.buildOutlineTree(context, pages, reordered);

    const outlinesDict = context.obj({
      Type: 'Outlines',
      Count: reordered.length,
    }) as PDFDict;
    outlinesDict.set(PDFName.of('First'), firstRef);
    outlinesDict.set(PDFName.of('Last'), lastRef);
    doc.catalog.set(PDFName.of('Outlines'), outlinesDict);

    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private findOutlineItemByPath(doc: PDFDocument, path: number[]): PDFRef | PDFDict | null {
    const catalog = doc.catalog;
    const context = doc.context;
    const outlinesRef = catalog.get(PDFName.of('Outlines'));
    if (!outlinesRef) return null;

    const outlinesDict = (outlinesRef instanceof PDFDict ? outlinesRef : context.lookup(outlinesRef)) as PDFDict;
    if (!outlinesDict) return null;

    let currentRef: PDFRef | PDFDict = outlinesDict.get(PDFName.of('First')) as PDFRef | PDFDict;
    if (!currentRef) return null;

    for (let depth = 0; depth < path.length; depth++) {
      const targetIndex = path[depth];
      let item: PDFDict | null = null;

      // Walk to the targetIndex-th item at this level
      for (let i = 0; i < targetIndex; i++) {
        const currentDict = (currentRef instanceof PDFDict ? currentRef : context.lookup(currentRef)) as PDFDict;
        const next = currentDict.get(PDFName.of('Next'));
        if (!next) return null;
        currentRef = next as PDFRef | PDFDict;
      }

      item = (currentRef instanceof PDFDict ? currentRef : context.lookup(currentRef)) as PDFDict;
      if (!item) return null;

      // If not the last path element, descend into children
      if (depth < path.length - 1) {
        const firstChild = item.get(PDFName.of('First'));
        if (!firstChild) return null;
        currentRef = firstChild as PDFRef | PDFDict;
      } else {
        return currentRef;
      }
    }

    return currentRef;
  }
}