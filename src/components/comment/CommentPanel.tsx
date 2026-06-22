import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Comment } from '@/types/common';

interface CommentPanelProps {
  /** 当前选中的标注 ID */
  annotationId?: string | null;
  /** 关闭回调 */
  onClose?: () => void;
}

/** 最大嵌套显示层级 */
const MAX_NEST_LEVEL = 5;

/** 评论节点（包含子评论） */
interface CommentNode {
  comment: Comment;
  children: CommentNode[];
}

/** 构建评论树 */
function buildCommentTree(comments: Comment[]): CommentNode[] {
  const nodeMap = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  // 创建所有节点
  for (const c of comments) {
    nodeMap.set(c.id, { comment: c, children: [] });
  }

  // 建立父子关系
  for (const c of comments) {
    const node = nodeMap.get(c.id)!;
    if (c.parentId && nodeMap.has(c.parentId)) {
      nodeMap.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 按时间排序
  const sortNodes = (nodes: CommentNode[]) => {
    nodes.sort((a, b) => new Date(a.comment.createdAt).getTime() - new Date(b.comment.createdAt).getTime());
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

/** 递归评论项组件 */
const CommentItem: React.FC<{
  node: CommentNode;
  depth: number;
  allComments: Comment[];
  onReply: (parentId: string) => void;
  onDelete: (commentId: string) => void;
}> = ({ node, depth, allComments, onReply, onDelete }) => {
  const { comment, children } = node;
  const effectiveDepth = Math.min(depth, MAX_NEST_LEVEL);
  const parentComment = comment.parentId ? allComments.find((c) => c.id === comment.parentId) : null;

  return (
    <div
      className={`comment-item ${depth > 0 ? 'comment-reply' : ''}`}
      style={{ marginLeft: depth > 0 ? Math.min(effectiveDepth * 16, MAX_NEST_LEVEL * 16) : 0 }}
      role="article"
      aria-label={`${comment.author} 的评论`}
    >
      {parentComment && depth > 0 && (
        <div className="comment-reply-context">
          <span className="reply-context-author">@{parentComment.author}</span>
          <span className="reply-context-text">
            {parentComment.text.length > 30 ? parentComment.text.substring(0, 30) + '...' : parentComment.text}
          </span>
        </div>
      )}
      <div className="comment-header">
        <span className="comment-author">{comment.author}</span>
        <span className="comment-time">{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
      </div>
      <p className="comment-text">{comment.text}</p>
      <div className="comment-actions">
        <button className="comment-action-btn" onClick={() => onReply(comment.id)} aria-label="回复">回复</button>
        <button className="comment-action-btn comment-delete-btn" onClick={() => onDelete(comment.id)} aria-label="删除">删除</button>
      </div>
      {children.length > 0 && (
        <div className="comment-replies" role="group" aria-label="回复">
          {children.map((child) => (
            <CommentItem
              key={child.comment.id}
              node={child}
              depth={depth + 1}
              allComments={allComments}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CommentPanel: React.FC<CommentPanelProps> = ({ annotationId, onClose }) => {
  const comments = useAnnotationStore((s) => s.comments);
  const addComment = useAnnotationStore((s) => s.addComment);
  const removeComment = useAnnotationStore((s) => s.removeComment);
  const annotations = useAnnotationStore((s) => s.annotations);

  const [author, setAuthor] = useState('用户');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const annComments = useMemo(() => {
    if (!annotationId) return [];
    return comments.filter((c) => c.annotationId === annotationId);
  }, [comments, annotationId]);

  // 构建评论树（支持多级嵌套）
  const commentTree = useMemo(() => {
    return buildCommentTree(annComments);
  }, [annComments]);

  // 回复目标评论信息
  const replyTarget = useMemo(() => {
    if (!replyTo) return null;
    return annComments.find((c) => c.id === replyTo);
  }, [annComments, replyTo]);

  const ann = annotations.find((a) => a.id === annotationId);

  const handleSubmit = () => {
    if (!text.trim() || !annotationId) return;
    addComment(annotationId, author || '匿名', text.trim(), replyTo);
    setText('');
    setReplyTo(undefined);
    // 发送后滚动到底部
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }, 100);
  };

  const handleReply = (parentId: string) => {
    setReplyTo(parentId);
    // 自动聚焦输入框
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 面板打开时自动聚焦
  useEffect(() => {
    if (annotationId) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [annotationId]);

  if (!annotationId || !ann) return null;

  const typeLabels: Record<string, string> = {
    rect: '矩形', ellipse: '椭圆', arrow: '箭头', line: '直线',
    freehand: '画笔', text: '文本', highlight: '高亮', stickyNote: '便签',
    stamp: '印章', signature: '签名', redaction: '涂黑', wavyLine: '波浪线',
    measureDistance: '距离', measureArea: '面积', measureAngle: '角度',
  };

  return (
    <div className="comment-panel" role="region" aria-label="评论面板">
      <div className="comment-panel-header">
        <h3>评论 ({annComments.length})</h3>
        <div className="comment-panel-info">
          <span className="comment-type-badge">{typeLabels[ann.type] ?? ann.type}</span>
          <span className="comment-page">第 {ann.page} 页</span>
        </div>
        {onClose && (
          <button className="comment-close-btn" onClick={onClose} aria-label="关闭评论面板">×</button>
        )}
      </div>

      <div className="comment-list" role="feed" aria-label="评论列表" ref={listRef}>
        {commentTree.length === 0 && (
          <p className="comment-empty">暂无评论，在下方输入第一条评论</p>
        )}
        {commentTree.map((node) => (
          <CommentItem
            key={node.comment.id}
            node={node}
            depth={0}
            allComments={annComments}
            onReply={handleReply}
            onDelete={removeComment}
          />
        ))}
      </div>

      <div className="comment-input-area">
        {replyTarget && (
          <div className="comment-reply-hint">
            回复 <strong>@{replyTarget.author}</strong>: {replyTarget.text.length > 20 ? replyTarget.text.substring(0, 20) + '...' : replyTarget.text}
            <button className="comment-cancel-reply" onClick={() => setReplyTo(undefined)} aria-label="取消回复">×</button>
          </div>
        )}
        <div className="comment-input-row">
          <input
            type="text"
            className="comment-author-input"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="作者"
            aria-label="作者名"
          />
          <textarea
            ref={textareaRef}
            className="comment-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入评论... (Enter 发送, Shift+Enter 换行)"
            aria-label="评论内容"
            rows={2}
          />
        </div>
        <button
          className="comment-submit-btn"
          onClick={handleSubmit}
          disabled={!text.trim()}
          aria-label="发送评论"
        >
          发送
        </button>
      </div>
    </div>
  );
};
