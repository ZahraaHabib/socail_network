'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import UserLink from '../../../components/UserLink';

// Avatar component for displaying user avatars with fallback to initials
interface AvatarProps {
  src?: string;
  firstName?: string;
  lastName?: string;
  username: string;
  size?: 'sm' | 'md' | 'lg';
}

const Avatar = ({ src, firstName, lastName, username, size = 'md' }: AvatarProps) => {
  const [imageError, setImageError] = useState(false);

  // Get initials from first name and last name, or fallback to username
  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
    }
    if (firstName) {
      return firstName.charAt(0).toUpperCase();
    }
    if (username) {
      return username.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-lg'
  };


  // Normalize avatar src: handle filename, /uploads/avatars/..., or full URL
  let avatarSrc = src;
  if (src && src.trim() !== '' && !imageError) {
    if (src.startsWith('http')) {
      avatarSrc = src;
    } else if (src.startsWith('/uploads/avatars/')) {
      avatarSrc = `http://localhost:8080${src}`;
    } else {
      avatarSrc = `http://localhost:8080/uploads/avatars/${src}`;
    }
  }

  const shouldShowImage = avatarSrc && !imageError && avatarSrc.trim() !== '';

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-semibold flex-shrink-0 shadow-md overflow-hidden`}>
      {shouldShowImage ? (
        <img
          src={avatarSrc}
          alt={`${username}'s avatar`}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{getInitials()}</span>
      )}
    </div>
  );
};

type Post = {
  id: number;
  user_id: number;
  author_username: string;
  author_first_name: string;
  author_last_name: string;
  author_avatar: string;
  title: string;
  content: string;
  image_path?: string;
  created_at: string;
  updated_at: string;
  like_count: number;
  dislike_count: number;
  user_liked: boolean;
  user_disliked: boolean;
};

type Comment = {
  id: number;
  post_id: number;
  user_id: number;
  author_username: string;
  author_first_name: string;
  author_last_name: string;
  author_avatar: string;
  content: string;
  created_at: string;
};


export default function PostDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params?.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [error, setError] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const MAX_COMMENT_LENGTH = 150;

  // Fetch current user id on mount (use /whoami for consistency with feed)
  useEffect(() => {
    fetch('http://localhost:8080/whoami', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.id) setCurrentUserId(data.id);
      })
      .catch(() => setCurrentUserId(null));
  }, []);

  useEffect(() => {
    if (!postId) return;
    fetchPost();
    fetchComments();
    // eslint-disable-next-line
  }, [postId]);

  const fetchPost = async () => {
    setLoading(true);
    setError('');
    try {
      // If you have GET /posts/{id}, use it. Otherwise, fetch all and filter.
      const res = await fetch(`http://localhost:8080/posts`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      const data: Post[] = await res.json();
      const found = data.find((p) => p.id === Number(postId));
      if (!found) throw new Error('Post not found');
      setPost(found);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Failed to load post');
      } else {
        setError('Failed to load post');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    setCommentLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}/comments`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleLike = async () => {
    if (!post) return;
    setLikeLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/posts/${post.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_like: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setPost({
        ...post,
        like_count: result.like_count,
        dislike_count: result.dislike_count,
        user_liked: result.liked,
        user_disliked: result.disliked,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to like post');
      } else {
        alert('Failed to like post');
      }
    } finally {
      setLikeLoading(false);
    }
  };

  const handleDislike = async () => {
    if (!post) return;
    setLikeLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/posts/${post.id}/dislike`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_like: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setPost({
        ...post,
        like_count: result.like_count,
        dislike_count: result.dislike_count,
        user_liked: result.liked,
        user_disliked: result.disliked,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to dislike post');
      } else {
        alert('Failed to dislike post');
      }
    } finally {
      setLikeLoading(false);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    setCommentLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: commentInput }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCommentInput('');
      await fetchComments();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to add comment');
      } else {
        alert('Failed to add comment');
      }
    } finally {
      setCommentLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-center text-gray-600">Loading post...</div>
        </div>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="text-center text-red-600">{error}</div>
        </div>
      </div>
    </div>
  );
  
  if (!post) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-center text-gray-600">Post not found.</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button
          className="mb-6 text-blue-600 hover:text-blue-800 flex items-center gap-2 font-medium transition-colors"
          onClick={() => router.back()}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Feed
        </button>
        
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 mb-8">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Avatar
                src={post.author_avatar}
                firstName={post.author_first_name}
                lastName={post.author_last_name}
                username={post.author_username}
                size="md"
              />
              <div className="flex items-center gap-2">
                <UserLink
                  userId={post.user_id}
                  username={post.author_username}
                  firstName={post.author_first_name}
                  lastName={post.author_last_name}
                  className="font-semibold text-blue-700 hover:text-blue-800 transition-colors"
                  isCurrentUser={currentUserId === post.user_id}
                />
                <span className="text-sm text-gray-500">
                  {new Date(post.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            
            {post.title && (
              <div className="text-2xl font-bold mb-4 text-gray-900">{post.title}</div>
            )}
            
            <div className="text-gray-800 mb-4 break-words whitespace-pre-wrap leading-relaxed">
              {post.content}
            </div>
            
            {/* Post Image */}
            {post.image_path && (
              <div className="mb-6">
                <img
                  src={`http://localhost:8080${post.image_path}`}
                  alt="Post image"
                  className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm"
                />
              </div>
            )}
            
            <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none ${
                  post.user_liked
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-blue-50 border border-gray-200'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
                <span>{post.like_count}</span>
              </button>
              
              <button
                onClick={handleDislike}
                disabled={likeLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none ${
                  post.user_disliked
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-red-50 border border-gray-200'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" style={{ transform: 'rotate(180deg)' }}>
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
                <span>{post.dislike_count}</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-6 text-gray-900 flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.126-.263c-3.573 3.573-9.758 1.021-9.758-4.737 0-6.116 4.686-11 10.5-11 4.418 0 8 3.582 8 8z" />
              </svg>
              Comments ({comments.length})
            </h3>
            
            {commentLoading && (
              <div className="text-center py-8">
                <div className="text-gray-500">Loading comments...</div>
              </div>
            )}
            
            {!commentLoading && comments.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-400">No comments yet. Be the first to comment!</div>
              </div>
            )}
            
            {!commentLoading && comments.length > 0 && (
              <div className="space-y-4 mb-6">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={comment.author_avatar}
                        firstName={comment.author_first_name}
                        lastName={comment.author_last_name}
                        username={comment.author_username}
                        size="sm"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <UserLink
                            userId={comment.user_id}
                            username={comment.author_username}
                            firstName={comment.author_first_name}
                            lastName={comment.author_last_name}
                            className="font-semibold text-blue-700 hover:text-blue-800 transition-colors text-sm"
                            isCurrentUser={currentUserId === comment.user_id}
                          />
                          <span className="text-xs text-gray-400">
                            {new Date(comment.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-gray-700 break-words whitespace-pre-wrap">{comment.content}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Add Comment Form */}
            <div>
              <form onSubmit={handleAddComment} className="flex gap-3">
                <input
                  type="text"
                  className="flex-1 border border-gray-300 rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Write a comment..."
                  value={commentInput}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_COMMENT_LENGTH) {
                      setCommentInput(e.target.value);
                    }
                  }}
                  disabled={commentLoading}
                />
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-full font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
                  disabled={commentLoading || !commentInput.trim()}
                >
                  Comment
                </button>
              </form>
              {/* Character Counter */}
              <div className="mt-2 text-right">
                <span className={`text-xs ${
                  commentInput.length > MAX_COMMENT_LENGTH * 0.9
                    ? 'text-red-500'
                    : commentInput.length > MAX_COMMENT_LENGTH * 0.8
                    ? 'text-yellow-500'
                    : 'text-gray-400'
                }`}>
                  {commentInput.length}/{MAX_COMMENT_LENGTH}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}