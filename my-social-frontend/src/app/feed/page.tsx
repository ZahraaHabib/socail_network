'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import UserLink from '../../components/UserLink';

type Post = {
  id: number;
  user_id: number;
  author_username: string;
  author_first_name: string;
  author_last_name: string;
  author_avatar: string;
  content: string;
  image_path?: string;
  privacy?: number;
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

export default function FeedPage() {
  const { isAuthenticated, loading, onMessage, wsConnected } = useAuth();

  // Real-time: Listen for new comments via WebSocket
  useEffect(() => {
    if (!onMessage || !wsConnected) return;
    onMessage('new_comment', (data: Comment) => {
      setComments(prev => {
        const postId = data.post_id;
        const prevComments = prev[postId] || [];
        // Avoid duplicate
        if (prevComments.some(c => c.id === data.id)) return prev;
        return { ...prev, [postId]: [...prevComments, data] };
      });
    });

    // Real-time: Listen for new posts via WebSocket
    onMessage('new_post', (data: Post) => {
      setPosts(prevPosts => {
        // Avoid duplicate if already present (e.g., if user is the author)
        if (prevPosts.some(p => p.id === data.id)) return prevPosts;
        return [data, ...prevPosts];
      });
    });

    // Real-time: Listen for like/dislike updates via WebSocket
    onMessage('post_like_updated', (data: { post_id: number; like_count: number; dislike_count: number }) => {
      setPosts(prevPosts => prevPosts.map(post =>
        post.id === data.post_id
          ? { ...post, like_count: data.like_count, dislike_count: data.dislike_count }
          : post
      ));
    });
  }, [onMessage, wsConnected]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postContent, setPostContent] = useState('');
  const [postPrivacy, setPostPrivacy] = useState(0); // 0=public, 1=followers, 2=close_friends
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [likeLoading, setLikeLoading] = useState<{ [postId: number]: boolean }>({});
  const [commentInputs, setCommentInputs] = useState<{ [postId: number]: string }>({});
  const [commentLoading, setCommentLoading] = useState<{ [postId: number]: boolean }>({});
  const [comments, setComments] = useState<{ [postId: number]: Comment[] }>({});
  const [showComments, setShowComments] = useState<{ [postId: number]: boolean }>({});
  const [postLoading, setPostLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState<{ [postId: number]: boolean }>({});
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // Character limit for posts
  const MAX_POST_LENGTH = 280; // You can change this number
  const MAX_COMMENT_LENGTH = 150; // Character limit for comments

  useEffect(() => {
    console.log('FeedPage useEffect - isAuthenticated:', isAuthenticated, 'loading:', loading);
    if (isAuthenticated) {
      fetchPosts();
      fetchCurrentUser();
    } else if (!loading) {
      // Clear loading state if not authenticated and auth loading is done
      setLoadingPosts(false);
    }
  }, [isAuthenticated, loading]);

  const fetchCurrentUser = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const res = await fetch('http://localhost:8080/whoami', {
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const userData = await res.json();
        console.log('Fetched user data:', userData); // Debug log
        setCurrentUserId(userData.id);
      } else {
        console.log('Failed to fetch current user: Not authenticated', res.status);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Failed to fetch current user: Request timeout');
      } else {
        console.error('Failed to fetch current user:', err);
      }
    }
  };

  const fetchPosts = async () => {
    setLoadingPosts(true);
    setError('');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const res = await fetch('http://localhost:8080/posts', {
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setPosts(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Request timeout - please check your connection');
        } else {
          setError(err.message || 'Failed to load posts');
        }
      } else {
        setError('Failed to load posts');
      }
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleLike = async (postId: number) => {
    setLikeLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_like: true }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const result = await res.json();
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                like_count: result.like_count,
                dislike_count: result.dislike_count,
                user_liked: result.liked,
                user_disliked: result.disliked,
              }
            : post
        )
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to like post');
      } else {
        alert('Failed to like post');
      }
    } finally {
      setLikeLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleDislike = async (postId: number) => {
    setLikeLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}/dislike`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_like: false }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const result = await res.json();
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                like_count: result.like_count,
                dislike_count: result.dislike_count,
                user_liked: result.liked,
                user_disliked: result.disliked,
              }
            : post
        )
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to dislike post');
      } else {
        alert('Failed to dislike post');
      }
    } finally {
      setLikeLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to delete post');
      }

      // Remove the post from the local state
      setPosts((prev) => prev.filter((post) => post.id !== postId));
      
      // Clean up related state
      setComments((prev) => {
        const newComments = { ...prev };
        delete newComments[postId];
        return newComments;
      });
      setShowComments((prev) => {
        const newShow = { ...prev };
        delete newShow[postId];
        return newShow;
      });
      setCommentInputs((prev) => {
        const newInputs = { ...prev };
        delete newInputs[postId];
        return newInputs;
      });

      alert('Post deleted successfully!');
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(`Failed to delete post: ${err.message}`);
      } else {
        alert('Failed to delete post');
      }
    } finally {
      setDeleteLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    setPostLoading(true);
    
    try {
      let imagePath = '';
      
      // Upload image if one is selected
      if (selectedImage) {
        const formData = new FormData();
        formData.append('image', selectedImage);
        
        const uploadRes = await fetch('http://localhost:8080/upload-image', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        
        if (!uploadRes.ok) {
          throw new Error('Failed to upload image');
        }
        
        const uploadResult = await uploadRes.json();
        imagePath = uploadResult.image_path;
      }
      
      // Create post with content and optional image
      const res = await fetch('http://localhost:8080/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          content: postContent,
          image_path: imagePath,
          privacy: postPrivacy
        }),
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      setPostContent('');
      setPostPrivacy(0);
      setSelectedImage(null);
      setImagePreview('');
      await fetchPosts();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to create post');
      } else {
        alert('Failed to create post');
      }
    } finally {
      setPostLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please select a valid image file (JPEG, PNG, or GIF)');
        return;
      }
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        return;
      }
      
      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview('');
  };

  const fetchComments = async (postId: number) => {
    setCommentLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}/comments`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setComments((prev) => ({ ...prev, [postId]: data }));
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to load comments');
      } else {
        alert('Failed to load comments');
      }
    } finally {
      setCommentLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleToggleComments = (postId: number) => {
    setShowComments((prev) => {
      const newState = { ...prev, [postId]: !prev[postId] };
      if (newState[postId] && !comments[postId]) {
        fetchComments(postId);
      }
      return newState;
    });
  };

  const handleAddComment = async (e: FormEvent, postId: number) => {
    e.preventDefault();
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    setCommentLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`http://localhost:8080/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      await fetchComments(postId);
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || 'Failed to add comment');
      } else {
        alert('Failed to add comment');
      }
    } finally {
      setCommentLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex items-center gap-3 text-blue-600">
          <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-lg font-medium">Checking authentication...</span>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <div className="p-8 text-center text-red-600">Please log in to view the feed.</div>;
  }

  return (
    <>
      <Header />
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        {/* Main Container */}
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Welcome Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Welcome to Your Feed</h1>
            <p className="text-gray-600">Share your thoughts and connect with friends</p>
          </div>

          {/* Create Post Form */}
          <form
            onSubmit={handleCreatePost}
            className="mb-8 bg-white rounded-xl shadow-lg border border-gray-100 p-6 transition-all hover:shadow-xl"
          >
            {/* Post Input */}
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                📝
              </div>
              <div className="flex-1">
                <textarea
                  className="w-full border-2 border-gray-200 rounded-xl p-4 text-lg placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                  rows={3}
                  placeholder="What's happening? Share your thoughts..."
                  value={postContent}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_POST_LENGTH) {
                      setPostContent(e.target.value);
                    }
                  }}
                  disabled={postLoading}
                  maxLength={MAX_POST_LENGTH}
                />
                {/* Character Counter */}
                <div className="flex justify-between items-center mt-2 px-1">
                  <div className="text-xs text-gray-400">
                    Share your thoughts with the world
                  </div>
                  <div className={`text-sm font-medium ${
                    postContent.length > MAX_POST_LENGTH * 0.9
                      ? postContent.length >= MAX_POST_LENGTH
                        ? 'text-red-500'
                        : 'text-orange-500'
                      : 'text-gray-500'
                  }`}>
                    {postContent.length}/{MAX_POST_LENGTH}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Privacy Selector */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Privacy:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPostPrivacy(0)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    postPrivacy === 0
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  disabled={postLoading}
                >
                  🌐 Public
                </button>
                <button
                  type="button"
                  onClick={() => setPostPrivacy(1)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    postPrivacy === 1
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  disabled={postLoading}
                >
                  👥 Followers
                </button>
                <button
                  type="button"
                  onClick={() => setPostPrivacy(2)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    postPrivacy === 2
                      ? 'bg-purple-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  disabled={postLoading}
                >
                  💜 Close Friends
                </button>
              </div>
            </div>
            
            {/* Image Preview */}
            {imagePreview && (
              <div className="relative mb-4 rounded-xl overflow-hidden bg-gray-50 border-2 border-dashed border-gray-200">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  width={500}
                  height={256}
                  className="w-full h-64 object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all"
                >
                  ✕
                </button>
              </div>
            )}
            
            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Add Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif"
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={postLoading}
                  />
                </label>
              </div>
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
                disabled={postLoading || !postContent.trim()}
              >
                {postLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Posting...
                  </span>
                ) : (
                  '📝 Share Post'
                )}
              </button>
            </div>
          </form>

          {/* Loading and Error States */}
          {loadingPosts && (
            <div className="text-center py-12">
              <div className="inline-flex items-center gap-3 text-blue-600">
                <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-lg font-medium">Loading posts...</span>
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-red-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}
          
          {!loadingPosts && posts.length === 0 && (
            <div className="text-center py-16">
              <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No posts yet</h3>
                <p className="text-gray-500">Be the first to share something amazing!</p>
              </div>
            </div>
          )}
          
          {/* Posts Grid */}
          <div className="space-y-6">
            {posts.map((post) => (
              <article
                key={post.id}
                className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                {/* Post Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <UserLink
                        userId={post.user_id}
                        username={post.author_username}
                        firstName={post.author_first_name}
                        lastName={post.author_last_name}
                        avatar={post.author_avatar}
                        showAvatar={true}
                        avatarSize={48}
                        showFullName={true}
                        isCurrentUser={currentUserId === post.user_id}
                        className="font-semibold text-gray-800 hover:text-blue-600 transition-colors"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600 font-medium">
                          @{post.author_username}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(() => {
                            const date = new Date(post.created_at);
                            return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString();
                          })()}
                        </span>
                      </div>
                    </div>
                    
                    {/* Privacy Badge and Delete Button */}
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                        post.privacy === 0 ? 'bg-green-100 text-green-700' :
                        post.privacy === 1 ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {post.privacy === 0 && (
                          <>
                            <span>🌐</span>
                            <span>Public</span>
                          </>
                        )}
                        {post.privacy === 1 && (
                          <>
                            <span>👥</span>
                            <span>Followers</span>
                          </>
                        )}
                        {post.privacy === 2 && (
                          <>
                            <span>💜</span>
                            <span>Close Friends</span>
                          </>
                        )}
                      </div>
                      
                      {/* Delete Button - Only show for own posts */}
                      {currentUserId && post.user_id === currentUserId && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          disabled={deleteLoading[post.id]}
                          className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all duration-200 disabled:opacity-50"
                          title="Delete post"
                        >
                          {deleteLoading[post.id] ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Post Content */}
                  <div className="text-gray-800 text-lg leading-relaxed mb-4 break-words whitespace-pre-wrap overflow-wrap-anywhere">
                    {post.content}
                  </div>
                </div>
                
                {/* Post Image */}
                {post.image_path && (
                  <div className="px-6 pb-4">
                    <div className="rounded-xl overflow-hidden bg-gray-100">
                      <Image
                        src={`http://localhost:8080${post.image_path}`}
                        alt="Post image"
                        width={800}
                        height={400}
                        className="w-full h-auto max-h-96 object-cover"
                        unoptimized={post.image_path.endsWith('.gif')}
                      />
                    </div>
                  </div>
                )}
                
                {/* Action Bar */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleLike(post.id)}
                        disabled={likeLoading[post.id]}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${
                          post.user_liked
                            ? 'bg-blue-500 text-white shadow-md hover:bg-blue-600'
                            : 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                        </svg>
                        <span>{post.like_count}</span>
                      </button>
                      
                      <button
                        onClick={() => handleDislike(post.id)}
                        disabled={likeLoading[post.id]}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${
                          post.user_disliked
                            ? 'bg-red-500 text-white shadow-md hover:bg-red-600'
                            : 'bg-white text-gray-600 hover:bg-red-50 hover:text-red-600 border border-gray-200'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" style={{ transform: 'rotate(180deg)' }}>
                          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                        </svg>
                        <span>{post.dislike_count}</span>
                      </button>
                      
                      <button
                        onClick={() => handleToggleComments(post.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 border border-gray-200 font-medium transition-all"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span>{showComments[post.id] ? 'Hide' : 'Show'} Comments</span>
                      </button>
                    </div>
                    
                    <Link
                      href={`/posts/${post.id}`}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 font-medium transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <span>View Details</span>
                    </Link>
                  </div>
                </div>
                
                {/* Comments Section */}
                {showComments[post.id] && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                    {commentLoading[post.id] && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading comments...
                      </div>
                    )}
                    
                    {comments[post.id] && comments[post.id].length === 0 && (
                      <div className="text-center text-gray-400 py-8">
                        <div className="text-4xl mb-2">💬</div>
                        <p>No comments yet. Be the first to comment!</p>
                      </div>
                    )}
                    
                    {comments[post.id] && comments[post.id].length > 0 && (
                      <div className="space-y-4 mb-6">
                        {comments[post.id].map((comment) => (
                          <div key={comment.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0">
                                <UserLink
                                  userId={comment.user_id}
                                  username={comment.author_username}
                                  firstName={comment.author_first_name}
                                  lastName={comment.author_last_name}
                                  avatar={comment.author_avatar}
                                  showAvatar={true}
                                  avatarSize={36}
                                  isCurrentUser={currentUserId === comment.user_id}
                                  className="font-semibold text-gray-800 hover:text-blue-600 transition-colors"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <UserLink
                                    userId={comment.user_id}
                                    username={comment.author_username}
                                    firstName={comment.author_first_name}
                                    lastName={comment.author_last_name}
                                    showFullName={true}
                                    isCurrentUser={currentUserId === comment.user_id}
                                    className="font-semibold text-gray-800 hover:text-blue-600 transition-colors text-sm"
                                  />
                                  <span className="text-gray-400">•</span>
                                  <span className="text-xs text-gray-500">
                                    {(() => {
                                      const date = new Date(comment.created_at);
                                      return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString();
                                    })()}
                                  </span>
                                </div>
                                <p className="text-gray-700 leading-relaxed break-words whitespace-pre-wrap overflow-wrap-anywhere">{comment.content}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Add Comment Form */}
                    <form
                      onSubmit={(e) => handleAddComment(e, post.id)}
                      className="space-y-2"
                    >
                      <div className="flex gap-3">
                        <input
                          type="text"
                          className="flex-1 border-2 border-gray-200 rounded-full px-4 py-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                          placeholder="Write a comment..."
                          value={commentInputs[post.id] || ''}
                          onChange={(e) => {
                            if (e.target.value.length <= MAX_COMMENT_LENGTH) {
                              setCommentInputs((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }));
                            }
                          }}
                          disabled={commentLoading[post.id]}
                          maxLength={MAX_COMMENT_LENGTH}
                        />
                        <button
                          type="submit"
                          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
                          disabled={commentLoading[post.id] || !(commentInputs[post.id] || '').trim()}
                        >
                          {commentLoading[post.id] ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            'Post'
                          )}
                        </button>
                      </div>
                      {/* Comment Character Counter */}
                      <div className="flex justify-end">
                        <div className={`text-xs ${
                          (commentInputs[post.id] || '').length > MAX_COMMENT_LENGTH * 0.9
                            ? (commentInputs[post.id] || '').length >= MAX_COMMENT_LENGTH
                              ? 'text-red-500'
                              : 'text-orange-500'
                            : 'text-gray-400'
                        }`}>
                          {(commentInputs[post.id] || '').length}/{MAX_COMMENT_LENGTH}
                        </div>
                      </div>
                    </form>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}