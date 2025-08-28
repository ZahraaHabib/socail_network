'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '../../../context/AuthContext';
import Header from '../../../components/Header';

type Post = {
    id: number;
    title: string;
    content: string;
    image_path?: string; // Add image path property
    createdAt?: string;
    created_at?: string; // Add this field for backend compatibility
    authorId?: number;
    userId?: number;
    authorUsername?: string;
    likeCount?: number;
    userLiked?: boolean;
    updatedAt?: string;
    updated_at?: string; // Add this field for backend compatibility
};

type UserRelationship = {
    is_followed_by_viewer?: boolean;
    has_pending_request_from_viewer?: boolean;
    is_close_friend?: boolean;
};

type UserProfile = {
    user: {
        id: number;
        username: string;
        first_name?: string;
        last_name?: string;
        avatar?: string;
        about_me?: string;
        is_private?: boolean;
        email?: string;
        date_of_birth?: string;
        created_at?: string;
    };
    stats: {
        followers_count: number;
        following_count: number;
        posts_count: number;
    };
    posts: Post[];
    relationship?: UserRelationship;
};

export default function UserProfilePage() {
    const { isAuthenticated, loading: authLoading } = useAuth();
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [followLoading, setFollowLoading] = useState(false);
    const [closeFriendLoading, setCloseFriendLoading] = useState(false);

    useEffect(() => {
        if (!userId) return;

        const fetchProfile = async () => {
            try {
                setLoading(true);
                setError(null);
                
                const response = await fetch(`http://localhost:8080/v2/users/${userId}`, {
                    credentials: 'include'
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        setError('User not found');
                    } else if (response.status === 401) {
                        setError('You need to be logged in to view profiles');
                    } else {
                        setError('Failed to load profile');
                    }
                    return;
                }

                const data = await response.json();
                console.log('Profile data received:', data);
                console.log('User object:', data.user);
                console.log('User fields:', {
                    username: data.user.username,
                    first_name: data.user.first_name,
                    last_name: data.user.last_name,
                    email: data.user.email,
                    nickname: data.user.nickname,
                    about_me: data.user.about_me,
                    avatar: data.user.avatar,
                    is_private: data.user.is_private,
                    created_at: data.user.created_at
                });
                console.log('Stats object:', data.stats);
                setProfile(data);
            } catch (err) {
                console.error('Error fetching profile:', err);
                setError('Network error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [userId]);

    const handleFollowToggle = async () => {
        if (!profile || !isAuthenticated) return;

        setFollowLoading(true);
        try {
            const method = profile.relationship?.is_followed_by_viewer ? 'DELETE' : 'POST';
            const endpoint = `http://localhost:8080/users/${userId}/follow`;
            
            const response = await fetch(endpoint, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            if (response.ok) {
                // Refresh the profile to get updated relationship status
                const updatedResponse = await fetch(`http://localhost:8080/v2/users/${userId}`, {
                    credentials: 'include'
                });
                if (updatedResponse.ok) {
                    const updatedData = await updatedResponse.json();
                    setProfile(updatedData);
                }
            } else {
                const errorData = await response.text();
                console.error('Failed to toggle follow status:', errorData);
                alert('Failed to update follow status. Please try again.');
            }
        } catch (error) {
            console.error('Error toggling follow:', error);
            alert('Network error occurred. Please try again.');
        } finally {
            setFollowLoading(false);
        }
    };

    const handleCloseFriendToggle = async () => {
        if (!profile || !isAuthenticated) return;

        setCloseFriendLoading(true);
        try {
            const method = profile.relationship?.is_close_friend ? 'DELETE' : 'POST';
            const endpoint = profile.relationship?.is_close_friend 
                ? `http://localhost:8080/close-friends/${userId}`
                : 'http://localhost:8080/close-friends';
            
            const body = profile.relationship?.is_close_friend 
                ? undefined 
                : JSON.stringify({ target_user_id: parseInt(userId) });

            const response = await fetch(endpoint, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: body,
                credentials: 'include',
            });

            if (response.ok) {
                // Refresh the profile to get updated relationship status
                const updatedResponse = await fetch(`http://localhost:8080/v2/users/${userId}`, {
                    credentials: 'include'
                });
                if (updatedResponse.ok) {
                    const updatedData = await updatedResponse.json();
                    setProfile(updatedData);
                }
            } else {
                const errorData = await response.text();
                console.error('Failed to toggle close friend status:', errorData);
                alert('Failed to update close friend status. Please try again.');
            }
        } catch (error) {
            console.error('Error toggling close friend:', error);
            alert('Network error occurred. Please try again.');
        } finally {
            setCloseFriendLoading(false);
        }
    };

    const handleBackToFeed = () => {
        router.push('/feed');
    };

    if (authLoading || loading) {
        return (
            <>
                <Header />
                <div className="p-8 text-center text-black">Loading...</div>
            </>
        );
    }

    if (!isAuthenticated) {
        return (
            <>
                <Header />
                <div className="p-8 text-center text-red-600 font-semibold">
                    Please log in to view profiles.
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <Header />
                <div className="max-w-2xl mx-auto p-8 mt-12">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                        <div className="text-red-600 font-semibold mb-4">{error}</div>
                        <button
                            onClick={handleBackToFeed}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                        >
                            Back to Feed
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (!profile) {
        return (
            <>
                <Header />
                <div className="p-8 text-center text-black">Profile not found</div>
            </>
        );
    }

    const { user, stats, relationship } = profile;

    // Check if this is a private profile that the viewer can't see
    const isPrivateAndNotFollowed = user.is_private && !relationship?.is_followed_by_viewer;

    const getFollowButtonText = () => {
        if (followLoading) return 'Loading...';
        if (relationship?.is_followed_by_viewer) return 'Unfollow';
        if (relationship?.has_pending_request_from_viewer) return 'Request Pending';
        return 'Follow';
    };

    const getFollowButtonStyle = () => {
        if (relationship?.is_followed_by_viewer) {
            return 'bg-red-500 hover:bg-red-600 text-white';
        }
        if (relationship?.has_pending_request_from_viewer) {
            return 'bg-gray-400 text-white cursor-not-allowed';
        }
        return 'bg-blue-500 hover:bg-blue-600 text-white';
    };

    const getCloseFriendButtonText = () => {
        if (closeFriendLoading) return 'Loading...';
        if (relationship?.is_close_friend) return 'Remove from Close Friends';
        return 'Add to Close Friends';
    };

    const getCloseFriendButtonStyle = () => {
        if (relationship?.is_close_friend) {
            return 'bg-orange-500 hover:bg-orange-600 text-white';
        }
        return 'bg-green-500 hover:bg-green-600 text-white';
    };

    // Show close friend button only if following
    const canAddToCloseFriends = relationship?.is_followed_by_viewer;

    return (
        <>
            <Header />
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
                <div className="max-w-4xl mx-auto p-6">
                    {/* Back Button */}
                    <button
                        onClick={handleBackToFeed}
                        className="mb-6 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold transition-colors duration-200 bg-white px-4 py-2 rounded-lg shadow-sm hover:shadow-md"
                    >
                        <span className="text-lg">←</span>
                        Back to Feed
                    </button>

                    {/* Main Profile Card */}
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                        {/* Cover Section */}
                        <div className="h-32 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-600"></div>
                        
                        {/* Profile Header */}
                        <div className="relative px-8 pb-8">
                            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 -mt-16">
                                {/* Avatar */}
                                <div className="relative">
                                    {user.avatar ? (
                                        <Image 
                                            src={user.avatar} 
                                            alt="Avatar" 
                                            width={120} 
                                            height={120} 
                                            className="rounded-full object-cover border-4 border-white shadow-lg bg-white" 
                                        />
                                    ) : (
                                        <div className="w-30 h-30 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-4xl font-bold text-white border-4 border-white shadow-lg">
                                            {user.first_name?.[0] || user.username?.[0] || '?'}
                                        </div>
                                    )}
                                    {user.is_private && (
                                        <div className="absolute -bottom-2 -right-2 bg-gray-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                            <span>🔒</span>
                                            Private
                                        </div>
                                    )}
                                </div>
                                
                                {/* User Info */}
                                <div className="flex-1 pt-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div>
                                            <h1 className="text-3xl font-bold text-gray-900 mb-1">
                                                {user.username}
                                            </h1>
                                            <p className="text-xl text-gray-700 mb-2">
                                                {user.first_name} {user.last_name}
                                            </p>
                                            <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                                                <span>📅</span>
                                                Joined: {user.created_at ? 
                                                    (() => {
                                                        const date = new Date(user.created_at);
                                                        return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
                                                    })() 
                                                    : 'N/A'}
                                            </p>
                                        </div>
                                        
                                        {/* Follow Button - Only show if not viewing own profile */}
                                        {relationship && (
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={handleFollowToggle}
                                                    disabled={followLoading || relationship?.has_pending_request_from_viewer}
                                                    className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 ${getFollowButtonStyle()}`}
                                                >
                                                    {getFollowButtonText()}
                                                </button>
                                                
                                                {/* Close Friends Button - Only show if following */}
                                                {canAddToCloseFriends && (
                                                    <button
                                                        onClick={handleCloseFriendToggle}
                                                        disabled={closeFriendLoading}
                                                        className={`px-4 py-3 rounded-xl font-semibold transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 flex items-center gap-2 ${getCloseFriendButtonStyle()}`}
                                                    >
                                                        <span>{relationship?.is_close_friend ? '💔' : '💚'}</span>
                                                        {getCloseFriendButtonText()}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Section */}
                        <div className="px-8 pb-6">
                            <div className="grid grid-cols-3 gap-6">
                                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                                    <div className="text-2xl font-bold text-blue-600">{stats.followers_count}</div>
                                    <div className="text-sm font-medium text-gray-600">Followers</div>
                                </div>
                                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                                    <div className="text-2xl font-bold text-purple-600">{stats.following_count}</div>
                                    <div className="text-sm font-medium text-gray-600">Following</div>
                                </div>
                                <div className="text-center p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl">
                                    <div className="text-2xl font-bold text-indigo-600">{stats.posts_count}</div>
                                    <div className="text-sm font-medium text-gray-600">Posts</div>
                                </div>
                            </div>
                        </div>

                        {/* About Section */}
                        {!isPrivateAndNotFollowed && (
                            <div className="px-8 pb-6">
                                <div className="bg-gray-50 rounded-xl p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                        <span>📝</span>
                                        About
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        {user.about_me || 'No bio yet.'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Posts Section */}
                    <div className="mt-8">
                        {isPrivateAndNotFollowed ? (
                            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
                                <div className="text-6xl mb-4">🔒</div>
                                <div className="text-xl font-semibold text-gray-700 mb-2">This account is private</div>
                                <div className="text-gray-500">
                                    Follow this user to see their posts
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                                {/* Posts Header */}
                                <div className="px-6 py-6 border-b border-gray-100">
                                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                                        </svg>
                                        Recent Posts
                                        {profile.posts && profile.posts.length > 0 && (
                                            <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                                                {profile.posts.length}
                                            </span>
                                        )}
                                    </h2>
                                </div>

                                {/* Posts List */}
                                <div className="p-6">
                                    {profile.posts && profile.posts.length > 0 ? (
                                        <div className="space-y-6">
                                            {profile.posts.map(post => (
                                                <div key={post.id} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 p-6">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                                                            {user.first_name && user.last_name 
                                                                ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()
                                                                : user.username.substring(0, 2).toUpperCase()
                                                            }
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-blue-700">{user.username}</span>
                                                            <span className="text-sm text-gray-500">
                                                                {(() => {
                                                                    const dateStr = post.created_at || post.createdAt;
                                                                    if (!dateStr) return 'N/A';
                                                                    const date = new Date(dateStr);
                                                                    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
                                                                })()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    {post.title && (
                                                        <div className="text-xl font-bold mb-3 text-gray-900">{post.title}</div>
                                                    )}
                                                    
                                                    <div className="text-gray-800 mb-4 break-words whitespace-pre-wrap leading-relaxed">{post.content}</div>
                                                    
                                                    {/* Post Image */}
                                                    {post.image_path && (
                                                        <div className="mb-4">
                                                            <Image
                                                                src={`http://localhost:8080${post.image_path}`}
                                                                alt="Post image"
                                                                width={600}
                                                                height={400}
                                                                className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm object-cover"
                                                                unoptimized={post.image_path.endsWith('.gif')}
                                                            />
                                                        </div>
                                                    )}
                                                    
                                                    <div className="flex justify-end pt-4 border-t border-gray-100">
                                                        <a 
                                                            href={`/posts/${post.id}`}
                                                            className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                                                        >
                                                            View Details →
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12">
                                            <div className="text-6xl mb-4">📝</div>
                                            <div className="text-xl font-semibold text-gray-700 mb-2">No posts yet</div>
                                            <div className="text-gray-500">This user hasn&apos;t shared anything yet.</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
