import React, { useState, useMemo } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Comment } from '@/types/common';

interface CommentPanelProps {
  /** 当前选中的标注 ID */
  annotationId?: string | null;
  /** 关闭回调 */
  onClose?: () => void;
}

/** 单条评论项 */
const CommentItem: React.FC<{
  comment: Comment;
  replies: Comment[];
  onReply: (parentId: string) => void;
  onDelete: (commentId: string) => void;
}> = ({ comment, replies, onReply, onDelete }) => (
  <div className="comment-item" role="article" aria-label={`${comment.author} 的评论`}>
    <div className="comment-header">
      <span className="comment-author">{comment.author}</span>
      <span className="comment-time">{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
    </div>
    <p className="comment-text">{comment.text}</p>
    <div className="comment-actions">
      <button className="comment-action-btn" onClick={() => onReply(comment.id)} aria-label="回复">回复</button>
      <button className="comment-action-btn comment-delete-btn" onClick={() => onDelete(comment.id)} aria-label="删除">删除</button>
    </div>
    {replies.length > 0 && (
      <div className="comment-replies" role="group" aria-label="回复">
        {replies.map((r) => (
          <div key={r.id} className="comment-item comment-reply">
            <div className="comment-header">
              <span className="comment-author">{r.author}</span>
              <span className="comment-time">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <p className="comment-text">{r.text}</p>
            <div className="comment-actions">
              <button className="comment-action-btn comment-delete-btn" onClick={() => onDelete(r.id)} aria-label="删除">删除</button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const CommentPanel: React.FC<CommentPanelProps> = ({ annotationId, onClose }) => {
  const comments = useAnnotationStore((s) => s.comments);
  const addComment = useAnnotationStore((s) => s.addComment);
  const removeComment = useAnnotationStore((s) => s.removeComment);
  const annotations = useAnnotationStore((s) => s.annotations);

  const [author, setAuthor] = useState('用户');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);

  const annComments = useMemo(() => {
    if (!annotationId) return [];
    return comments.filter((c) => c.annotationId === annotationId);
  }, [comments, annotationId]);

  // 构建线程树：顶层评论 + 各自回复
  const threads = useMemo(() => {
    const topLevel = annComments.filter((c) => !c.parentId);
    return topLevel.map((c) => ({
      comment: c,
      replies: annComments.filter((r) => r.parentId === c.id),
    }));
  }, [annComments]);

  const ann = annotations.find((a) => a.id === annotationId);

  const handleSubmit = () => {
    if (!text.trim() || !annotationId) return;
    addComment(annotationId, author || '匿名', text.trim(), replyTo);
    setText('');
    setReplyTo(undefined);
  };

  const handleReply = (parentId: string) => {
    setReplyTo(parentId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

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

      <div className="comment-list" role="feed" aria-label="评论列表">
        {threads.length === 0 && (
          <p className="comment-empty">暂无评论，在下方输入第一条评论</p>
        )}
        {threads.map(({ comment, replies }) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={replies}
            onReply={handleReply}
            onDelete={removeComment}
          />
        ))}
      </div>

      <div className="comment-input-area">
        {replyTo && (
          <div className="comment-reply-hint">
            回复评论...
            <button className="comment-cancel-reply" onClick={() => setReplyTo(undefined)}>×</button>
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
            className="comment-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入评论... (Enter 发送)"
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
