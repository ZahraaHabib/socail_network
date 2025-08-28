'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import { getSafeImageUrl } from '../../utils/imageUtils';

type Post = {
    id: number;
    title: string;
    content: string;
    createdAt?: string;
    created_at?: string; // Add backend compatibility
    authorId?: number;
    image_path?: string; // Add image path property
};

type UserFollowInfo = {
    id: number;
    username: string;
    first_name?: string;
    last_name?: string;
    avatar?: string;
    is_close_friend?: boolean;
};

type UserProfile = {
    user: {
        id: number;
        username: string;
        email: string;
        created_at: string;
        is_private: boolean;
        first_name?: string;
        last_name?: string;
        avatar?: string;
        about_me?: string;
        date_of_birth?: string;
        // Legacy support for other possible field names
        firstName?: string;
        lastName?: string;
        aboutMe?: string;
        isPrivate?: boolean;
        dateOfBirth?: string;
        createdAt?: string;
    };
    stats: {
        followers_count: number;
        following_count: number;
        posts_count: number;
        // Legacy support for camelCase
        followersCount?: number;
        followingCount?: number;
        postsCount?: number;
    };
    posts: Post[];
};

export default function ProfilePage() {
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        username: '',
        firstName: '',
        lastName: '',
        aboutMe: '',
        email: '',
        dateOfBirth: '',
        isPrivate: false
    });
    const [updateLoading, setUpdateLoading] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    
    // Modal states for followers/following lists
    const [showFollowersModal, setShowFollowersModal] = useState(false);
    const [showFollowingModal, setShowFollowingModal] = useState(false);
    const [showCloseFriendsModal, setShowCloseFriendsModal] = useState(false);
    const [followers, setFollowers] = useState<UserFollowInfo[]>([]);
    const [following, setFollowing] = useState<UserFollowInfo[]>([]);
    const [closeFriends, setCloseFriends] = useState<UserFollowInfo[]>([]);
    const [followersLoading, setFollowersLoading] = useState(false);
    const [followingLoading, setFollowingLoading] = useState(false);
    const [closeFriendsLoading, setCloseFriendsLoading] = useState(false);

    // Fetch close friends list
    const fetchCloseFriends = async () => {
        setCloseFriendsLoading(true);
        try {
            const response = await fetch('http://localhost:8080/close-friends', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setCloseFriends(data || []);
            } else {
                console.error('Failed to fetch close friends');
                setCloseFriends([]);
            }
        } catch (error) {
            console.error('Error fetching close friends:', error);
            setCloseFriends([]);
        } finally {
            setCloseFriendsLoading(false);
        }
    };

    useEffect(() => {
        fetch('http://localhost:8080/v2/users/me', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error('Not logged in or user not found');
                return res.json();
            })
            .then(data => {
                console.log('Profile data received:', data);
                
                // Ensure we have a valid user object
                if (!data || !data.user) {
                    throw new Error('Invalid profile data received');
                }
                
                // Provide default values for missing fields
                const safeData = {
                    user: {
                        id: data.user.id || 0,
                        username: data.user.username || '',
                        email: data.user.email || '',
                        created_at: data.user.created_at || new Date().toISOString(),
                        is_private: data.user.is_private || false,
                        first_name: data.user.first_name || '',
                        last_name: data.user.last_name || '',
                        avatar: data.user.avatar || '',
                        about_me: data.user.about_me || '',
                        date_of_birth: data.user.date_of_birth || '',
                        // Legacy support
                        firstName: data.user.firstName || data.user.first_name || '',
                        lastName: data.user.lastName || data.user.last_name || '',
                        aboutMe: data.user.aboutMe || data.user.about_me || '',
                        isPrivate: data.user.isPrivate !== undefined ? data.user.isPrivate : data.user.is_private || false,
                        dateOfBirth: data.user.dateOfBirth || data.user.date_of_birth || '',
                        createdAt: data.user.createdAt || data.user.created_at || new Date().toISOString()
                    },
                    stats: {
                        followers_count: data.stats?.followers_count || 0,
                        following_count: data.stats?.following_count || 0,
                        posts_count: data.stats?.posts_count || 0,
                        // Legacy support
                        followersCount: data.stats?.followersCount || data.stats?.followers_count || 0,
                        followingCount: data.stats?.followingCount || data.stats?.following_count || 0,
                        postsCount: data.stats?.postsCount || data.stats?.posts_count || 0
                    },
                    posts: Array.isArray(data.posts) ? data.posts : []
                };
                
                setProfile(safeData);
                
                // Populate edit form with current data - handle snake_case from backend
                const user = safeData.user;
                setEditForm({
                    username: user.username || '',
                    firstName: user.first_name || '',
                    lastName: user.last_name || '',
                    aboutMe: user.about_me || '',
                    email: user.email || '',
                    dateOfBirth: user.date_of_birth || '',
                    isPrivate: user.is_private || false
                });
                
                // Fetch close friends count on load
                fetchCloseFriends();
            })
            .catch((error) => {
                console.error('Error fetching profile:', error);
                setProfile(null);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleEditClick = () => {
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        // Reset form to original values
        if (profile) {
            setEditForm({
                username: profile.user.username || '',
                firstName: profile.user.firstName || '',
                lastName: profile.user.lastName || '',
                aboutMe: profile.user.aboutMe || '',
                email: profile.user.email || '',
                dateOfBirth: profile.user.dateOfBirth || '',
                isPrivate: profile.user.isPrivate || false
            });
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setEditForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('Please select an image file');
                return;
            }
            
            // Validate file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                alert('Image size should be less than 5MB');
                return;
            }
            
            setAvatarFile(file);
            
            // Create preview URL
            const reader = new FileReader();
            reader.onload = (event) => {
                setAvatarPreview(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const clearAvatarSelection = () => {
        setAvatarFile(null);
        setAvatarPreview(null);
        // Reset file input
        const fileInput = document.getElementById('avatar-input') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    };

    const handleSaveProfile = async () => {
        setUpdateLoading(true);
        
        console.log('=== PROFILE SAVE DEBUG ===');
        console.log('Original editForm:', editForm);
        
        // Validate required fields
        if (!editForm.username || !editForm.email) {
            alert('Username and email are required.');
            setUpdateLoading(false);
            return;
        }
        
        try {
            let avatarUrl = null;
            
            // Upload avatar first if a new one is selected
            if (avatarFile) {
                const formData = new FormData();
                formData.append('avatar', avatarFile);
                
                const avatarResponse = await fetch('http://localhost:8080/upload/avatar', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                });
                
                if (avatarResponse.ok) {
                    const avatarResult = await avatarResponse.json();
                    avatarUrl = avatarResult.avatar_url || avatarResult.url;
                    console.log('Avatar uploaded successfully:', avatarUrl);
                } else {
                    const errorText = await avatarResponse.text();
                    console.error('Avatar upload failed:', errorText);
                    alert('Failed to upload avatar. Please try again.');
                    setUpdateLoading(false);
                    return;
                }
            }
            
            // Clean up the data before sending
            const cleanedData = {
                username: editForm.username.trim(),
                firstName: editForm.firstName.trim(),
                lastName: editForm.lastName.trim(),
                aboutMe: editForm.aboutMe.trim(),
                email: editForm.email.trim(),
                dateOfBirth: editForm.dateOfBirth || null, // Handle empty date
                isPrivate: editForm.isPrivate,
                ...(avatarUrl && { avatar: avatarUrl }) // Only include avatar if uploaded
            };
            
            console.log('Cleaned data:', cleanedData);
            console.log('Date of birth value:', cleanedData.dateOfBirth);
            console.log('Is Private value:', cleanedData.isPrivate);
            console.log('Avatar URL:', avatarUrl);
            
            const requestBody = JSON.stringify(cleanedData);
            console.log('Request body JSON:', requestBody);
            
            const response = await fetch('http://localhost:8080/v2/users/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody,
                credentials: 'include',
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));

            if (response.ok) {
                const updatedData = await response.json();
                console.log('Profile update response:', updatedData);
                
                // Validate that we received the expected structure
                if (updatedData && updatedData.user) {
                    setProfile(updatedData);
                    setIsEditing(false);
                    
                    // Clear avatar states
                    setAvatarFile(null);
                    setAvatarPreview(null);
                    
                    // Also update the edit form with the returned data to ensure consistency
                    const user = updatedData.user;
                    setEditForm({
                        username: user?.username || '',
                        firstName: user?.first_name || '',
                        lastName: user?.last_name || '',
                        aboutMe: user?.about_me || '',
                        email: user?.email || '',
                        dateOfBirth: user?.date_of_birth || '',
                        isPrivate: user?.is_private || false
                    });
                    
                    console.log('Profile updated successfully');
                } else {
                    console.error('Invalid response structure:', updatedData);
                    alert('Profile update succeeded but received unexpected response format.');
                }
            } else {
                const errorText = await response.text();
                console.error('=== ERROR DETAILS ===');
                console.error('Status:', response.status);
                console.error('Status Text:', response.statusText);
                console.error('Error Response Body:', errorText);
                console.error('Request that failed:', requestBody);
                alert(`Failed to update profile: ${response.status} ${response.statusText}\n\nError: ${errorText}`);
            }
        } catch (error) {
            console.error('Network or JSON error:', error);
            alert('An error occurred while updating your profile. Please try again.');
        } finally {
            setUpdateLoading(false);
        }
    };

    // Fetch followers list
    const fetchFollowers = async () => {
        if (!profile?.user?.id) return;
        
        setFollowersLoading(true);
        try {
            const response = await fetch(`http://localhost:8080/users/${profile.user.id}/followers`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setFollowers(data || []);
            } else {
                console.error('Failed to fetch followers');
                setFollowers([]);
            }
        } catch (error) {
            console.error('Error fetching followers:', error);
            setFollowers([]);
        } finally {
            setFollowersLoading(false);
        }
    };

    // Fetch following list
    const fetchFollowing = async () => {
        if (!profile?.user?.id) return;
        
        setFollowingLoading(true);
        try {
            const response = await fetch(`http://localhost:8080/users/${profile.user.id}/following`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setFollowing(data || []);
            } else {
                console.error('Failed to fetch following');
                setFollowing([]);
            }
        } catch (error) {
            console.error('Error fetching following:', error);
            setFollowing([]);
        } finally {
            setFollowingLoading(false);
        }
    };

    // Handle clicking on close friends button
    const handleCloseFriendsClick = () => {
        fetchCloseFriends();
        setShowCloseFriendsModal(true);
    };

    // Remove close friend function
    const removeCloseFriend = async (targetUserId: number) => {
        try {
            const response = await fetch(`http://localhost:8080/close-friends/${targetUserId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                // Refresh the close friends list
                fetchCloseFriends();
            } else {
                console.error('Failed to remove close friend');
                alert('Failed to remove from close friends. Please try again.');
            }
        } catch (error) {
            console.error('Error removing close friend:', error);
            alert('Network error occurred. Please try again.');
        }
    };

    // Remove follower function
    const removeFollower = async (targetUserId: number) => {
        try {
            const response = await fetch(`http://localhost:8080/users/${targetUserId}/unfollow`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                // Refresh the followers list
                fetchFollowers();
            } else {
                console.error('Failed to remove follower');
                alert('Failed to remove follower. Please try again.');
            }
        } catch (error) {
            console.error('Error removing follower:', error);
            alert('Network error occurred. Please try again.');
        }
    };

    // Unfollow user function
    const unfollowUser = async (targetUserId: number) => {
        try {
            const response = await fetch(`http://localhost:8080/users/${targetUserId}/unfollow`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                // Refresh the following list
                fetchFollowing();
            } else {
                console.error('Failed to unfollow user');
                alert('Failed to unfollow user. Please try again.');
            }
        } catch (error) {
            console.error('Error unfollowing user:', error);
            alert('Network error occurred. Please try again.');
        }
    };

    // Navigate to user profile
    const viewUserProfile = (userId: number) => {
        window.location.href = `/profile/${userId}`;
    };

    // Handle clicking on followers count
    const handleFollowersClick = () => {
        fetchFollowers();
        setShowFollowersModal(true);
    };

    // Handle clicking on following count
    const handleFollowingClick = () => {
        fetchFollowing();
        setShowFollowingModal(true);
    };

    if (authLoading || loading) return <div className="p-8 text-center text-black">Loading...</div>;

    if (!isAuthenticated) {
        return <div className="p-8 text-center text-red-600 font-semibold">Please log in to view your profile.</div>;
    }

    if (!profile || !profile.user || !profile.user.id) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
                <Header />
                <div className="flex items-center justify-center min-h-[80vh]">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-2xl text-red-500">⚠️</span>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">Profile Not Found</h3>
                        <p className="text-gray-600 mb-4">Unable to load your profile data.</p>
                        <button 
                            onClick={() => window.location.reload()} 
                            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const { user, stats } = profile;

    // Check if profile is incomplete
    const isProfileIncomplete = !user.first_name || !user.last_name || !user.about_me || !user.date_of_birth;

    if (isEditing) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
                    <div className="max-w-4xl mx-auto p-6">
                        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 backdrop-blur-sm">
                            <h2 className="text-4xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xl">✏️</span>
                                </div>
                                Edit Profile
                            </h2>
                            
                            <div className="space-y-8">
                                {/* Avatar Upload Section */}
                                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl p-8 border-2 border-blue-200">
                                    <label className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                            <span className="text-white text-lg">📷</span>
                                        </div>
                                        Profile Picture
                                    </label>
                                    
                                    <div className="flex flex-col lg:flex-row items-center gap-8">
                                        {/* Current/Preview Avatar */}
                                        <div className="relative">
                                            {avatarPreview ? (
                                                <Image
                                                    src={avatarPreview}
                                                    alt="Avatar preview"
                                                    width={120}
                                                    height={120}
                                                    className="rounded-full object-cover border-4 border-white shadow-xl"
                                                />
                                            ) : (
                                                (() => {
                                                    const safeUrl = getSafeImageUrl(user.avatar);
                                                    return safeUrl ? (
                                                        <Image
                                                            src={safeUrl}
                                                            alt="Current avatar"
                                                            width={120}
                                                            height={120}
                                                            className="rounded-full object-cover border-4 border-white shadow-xl"
                                                            onError={(e) => {
                                                                const target = e.target as HTMLImageElement;
                                                                target.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-30 h-30 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-blue-600 flex items-center justify-center text-4xl font-bold text-white border-4 border-white shadow-xl">
                                                            {(user.first_name || user.firstName)?.[0] || user.username?.[0] || '?'}
                                                        </div>
                                                    );
                                                })()
                                            )}
                                            
                                            {avatarPreview && (
                                                <button
                                                    type="button"
                                                    onClick={clearAvatarSelection}
                                                    className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 shadow-lg"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Upload Controls */}
                                        <div className="flex-1 space-y-4">
                                            <div className="text-center lg:text-left">
                                                <h4 className="text-lg font-semibold text-gray-800 mb-2">
                                                    {avatarPreview ? 'New Avatar Selected' : 'Change Your Avatar'}
                                                </h4>
                                                <p className="text-gray-600 text-sm mb-4">
                                                    Upload a new profile picture. Supported formats: JPG, PNG, GIF (max 5MB)
                                                </p>
                                            </div>
                                            
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <label className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105">
                                                    <span className="text-lg">📁</span>
                                                    Choose Image
                                                    <input
                                                        id="avatar-input"
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleAvatarChange}
                                                        className="hidden"
                                                    />
                                                </label>
                                                
                                                {avatarPreview && (
                                                    <button
                                                        type="button"
                                                        onClick={clearAvatarSelection}
                                                        className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                                                    >
                                                        <span className="text-lg">🗑️</span>
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="group">
                                    <label className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-xs">👤</span>
                                        Username
                                    </label>
                                    <input
                                        type="text"
                                        name="username"
                                        value={editForm.username}
                                        onChange={handleInputChange}
                                        className="w-full border-2 border-gray-200 px-5 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-gray-900 bg-gray-50 transition-all duration-300 group-hover:border-gray-300"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="group">
                                        <label className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-xs">👤</span>
                                            First Name
                                        </label>
                                        <input
                                            type="text"
                                            name="firstName"
                                            value={editForm.firstName}
                                            onChange={handleInputChange}
                                            className="w-full border-2 border-gray-200 px-5 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-green-100 focus:border-green-400 text-gray-900 bg-gray-50 transition-all duration-300 group-hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="group">
                                        <label className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                            <span className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center text-xs">👤</span>
                                            Last Name
                                        </label>
                                        <input
                                            type="text"
                                            name="lastName"
                                            value={editForm.lastName}
                                            onChange={handleInputChange}
                                            className="w-full border-2 border-gray-200 px-5 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-100 focus:border-purple-400 text-gray-900 bg-gray-50 transition-all duration-300 group-hover:border-gray-300"
                                        />
                                    </div>
                                </div>

                                <div className="group">
                                    <label className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-xs">✉️</span>
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={editForm.email}
                                        onChange={handleInputChange}
                                        className="w-full border-2 border-gray-200 px-5 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-red-100 focus:border-red-400 text-gray-900 bg-gray-50 transition-all duration-300 group-hover:border-gray-300"
                                    />
                                </div>

                                <div className="group">
                                    <label className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center text-xs">🎂</span>
                                        Date of Birth
                                    </label>
                                    <input
                                        type="date"
                                        name="dateOfBirth"
                                        value={editForm.dateOfBirth}
                                        onChange={handleInputChange}
                                        className="w-full border-2 border-gray-200 px-5 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-yellow-100 focus:border-yellow-400 text-gray-900 bg-gray-50 transition-all duration-300 group-hover:border-gray-300"
                                    />
                                </div>

                                <div className="group">
                                    <label className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-xs">📝</span>
                                        About Me
                                    </label>
                                    <textarea
                                        name="aboutMe"
                                        value={editForm.aboutMe}
                                        onChange={handleInputChange}
                                        rows={4}
                                        className="w-full border-2 border-gray-200 px-5 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 text-gray-900 bg-gray-50 transition-all duration-300 resize-none group-hover:border-gray-300"
                                        placeholder="Tell us about yourself..."
                                    />
                                </div>

                                <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl border-2 border-gray-200 hover:border-gray-300 transition-all duration-300">
                                    <input
                                        type="checkbox"
                                        name="isPrivate"
                                        checked={editForm.isPrivate}
                                        onChange={handleInputChange}
                                        className="w-6 h-6 text-blue-600 rounded-lg focus:ring-blue-500 focus:ring-4"
                                    />
                                    <label className="text-sm font-bold text-gray-800 flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                                            <span className="text-white text-sm">🔒</span>
                                        </div>
                                        <div>
                                            <div>Private Profile</div>
                                            <div className="text-xs text-gray-600 font-normal">Only your followers can see your posts</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 mt-10 pt-8 border-t border-gray-200">
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={updateLoading}
                                    className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-10 py-4 rounded-2xl font-bold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 disabled:opacity-60 shadow-xl hover:shadow-2xl transform hover:scale-105 flex items-center justify-center gap-3"
                                >
                                    {updateLoading ? (
                                        <>
                                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                                            Saving Changes...
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-lg">💾</span>
                                            Save Changes
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={handleCancelEdit}
                                    className="bg-white text-gray-700 px-10 py-4 rounded-2xl font-bold border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-3"
                                >
                                    <span className="text-lg">❌</span>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Header />
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
                <div className="max-w-6xl mx-auto p-6">
                    {/* Profile Completion Banner */}
                    {isProfileIncomplete && (
                        <div className="mb-8 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-200 rounded-3xl p-8 shadow-xl backdrop-blur-sm">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                                    <span className="text-white text-2xl">🌟</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-2xl font-bold text-amber-800 mb-3">Complete Your Profile</h3>
                                    <p className="text-amber-700 mb-4 text-lg">Your profile is missing some information. Complete it to help others connect with you!</p>
                                    <button
                                        onClick={handleEditClick}
                                        className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3 rounded-2xl font-bold hover:from-amber-600 hover:to-orange-700 transition-all duration-300 flex items-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105"
                                    >
                                        <span className="text-lg">✏️</span>
                                        Complete Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main Profile Card */}
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden relative backdrop-blur-sm">
                        {/* Edit Button in Top Right Corner */}
                        <button
                            onClick={handleEditClick}
                            className="absolute top-8 right-8 z-10 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 flex items-center gap-3 shadow-xl hover:shadow-2xl transform hover:scale-105"
                        >
                            <span className="text-lg">✏️</span>
                            Edit Profile
                        </button>

                        {/* Enhanced Cover Section */}
                        <div className="h-48 bg-gradient-to-r from-blue-400 via-purple-500 to-indigo-600 relative overflow-hidden">
                        </div>
                        
                        {/* Enhanced Profile Header */}
                        <div className="relative px-10 pb-10">
                            <div className="flex flex-col lg:flex-row items-start lg:items-end gap-8 -mt-20">
                                {/* Enhanced Avatar */}
                                <div className="relative">
                                    {(() => {
                                        const safeUrl = getSafeImageUrl(user.avatar);
                                        return safeUrl ? (
                                            <Image 
                                                src={safeUrl} 
                                                alt="Avatar" 
                                                width={160} 
                                                height={160} 
                                                className="rounded-full object-cover border-6 border-white shadow-2xl bg-white" 
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-blue-600 flex items-center justify-center text-5xl font-bold text-white border-6 border-white shadow-2xl">
                                                {(user.first_name || user.firstName)?.[0] || user.username?.[0] || '?'}
                                            </div>
                                        );
                                    })()}
                                    {(user.is_private || user.isPrivate) && (
                                        <div className="absolute -bottom-3 -right-3 bg-gradient-to-r from-gray-600 to-gray-800 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                                            <span>🔒</span>
                                            Private
                                        </div>
                                    )}
                                </div>
                                
                                {/* Enhanced User Info */}
                                <div className="flex-1 pt-6">
                                    <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-2">
                                        {user.username || 'Unknown User'}
                                    </h1>
                                    <p className="text-2xl lg:text-3xl text-gray-700 mb-3 font-semibold">
                                        {(user.first_name || user.firstName)} {(user.last_name || user.lastName)}
                                    </p>
                                    <p className="text-base text-gray-600 flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full w-fit">
                                        <span className="text-lg">📅</span>
                                        Member since: {(user.created_at || user.createdAt) ? 
                                            new Date(user.created_at || user.createdAt || '').toLocaleDateString() : 
                                            'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Enhanced Stats Section */}
                        <div className="px-10 pb-8">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                <button 
                                    onClick={handleFollowersClick}
                                    className="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl hover:from-blue-100 hover:to-blue-200 transition-all duration-300 cursor-pointer transform hover:scale-105 shadow-lg hover:shadow-xl border border-blue-200"
                                >
                                    <div className="text-3xl font-bold text-blue-600 mb-2">{stats.followers_count || stats.followersCount || 0}</div>
                                    <div className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
                                        <span>👥</span>
                                        Followers
                                    </div>
                                </button>
                                <button 
                                    onClick={handleFollowingClick}
                                    className="text-center p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl hover:from-purple-100 hover:to-purple-200 transition-all duration-300 cursor-pointer transform hover:scale-105 shadow-lg hover:shadow-xl border border-purple-200"
                                >
                                    <div className="text-3xl font-bold text-purple-600 mb-2">{stats.following_count || stats.followingCount || 0}</div>
                                    <div className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
                                        <span>🔗</span>
                                        Following
                                    </div>
                                </button>
                                <button 
                                    onClick={handleCloseFriendsClick}
                                    className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl hover:from-green-100 hover:to-green-200 transition-all duration-300 cursor-pointer transform hover:scale-105 shadow-lg hover:shadow-xl border border-green-200"
                                >
                                    <div className="text-3xl font-bold text-green-600 mb-2">{closeFriends.length}</div>
                                    <div className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
                                        <span>💚</span>
                                        Close Friends
                                    </div>
                                </button>
                                <div className="text-center p-6 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl shadow-lg border border-indigo-200">
                                    <div className="text-3xl font-bold text-indigo-600 mb-2">{stats.posts_count || stats.postsCount || 0}</div>
                                    <div className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
                                        <span>📱</span>
                                        Posts
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Enhanced About Section */}
                        <div className="px-10 pb-8">
                            <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-8 border border-gray-200 shadow-lg">
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                                        <span className="text-white text-lg">📝</span>
                                    </div>
                                    About Me
                                </h3>
                                <p className="text-gray-700 leading-relaxed text-lg">
                                    {user.about_me || user.aboutMe || 'No bio provided yet.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Profile Details Card */}
                    <div className="mt-8 bg-white rounded-3xl shadow-2xl border border-gray-100 backdrop-blur-sm">
                        <div className="px-10 py-8 border-b border-gray-100">
                            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xl">👤</span>
                                </div>
                                Profile Details
                            </h2>
                        </div>

                        <div className="p-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs">👤</span>
                                        Username
                                    </label>
                                    <div className="w-full bg-gradient-to-r from-gray-50 to-blue-50 border-2 border-gray-200 px-6 py-4 rounded-2xl text-gray-900 font-medium">
                                        {user.username || 'Not provided'}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center text-xs">✉️</span>
                                        Email
                                    </label>
                                    <div className="w-full bg-gradient-to-r from-gray-50 to-red-50 border-2 border-gray-200 px-6 py-4 rounded-2xl text-gray-900 font-medium">
                                        {user.email || 'Not provided'}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-xs">👤</span>
                                        First Name
                                    </label>
                                    <div className="w-full bg-gradient-to-r from-gray-50 to-green-50 border-2 border-gray-200 px-6 py-4 rounded-2xl text-gray-900 font-medium">
                                        {user.first_name || user.firstName || 'Not provided'}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-xs">👤</span>
                                        Last Name
                                    </label>
                                    <div className="w-full bg-gradient-to-r from-gray-50 to-purple-50 border-2 border-gray-200 px-6 py-4 rounded-2xl text-gray-900 font-medium">
                                        {user.last_name || user.lastName || 'Not provided'}
                                    </div>
                                </div>

                                <div className="space-y-2 lg:col-span-2">
                                    <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center text-xs">🎂</span>
                                        Date of Birth
                                    </label>
                                    <div className="w-full bg-gradient-to-r from-gray-50 to-yellow-50 border-2 border-gray-200 px-6 py-4 rounded-2xl text-gray-900 font-medium">
                                        {(user.date_of_birth || user.dateOfBirth) ? 
                                            new Date(user.date_of_birth || user.dateOfBirth || '').toLocaleDateString() : 
                                            'Not provided'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Recent Posts Section */}
                    {profile && profile.posts && profile.posts.length > 0 && (
                        <div className="mt-8 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                            <div className="px-6 py-6 border-b border-gray-100">
                                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                                    </svg>
                                    Recent Posts
                                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                                        {profile.posts.length}
                                    </span>
                                </h2>
                            </div>
                            
                            <div className="p-6">
                                <div className="space-y-6 max-h-96 overflow-y-auto">
                                    {profile.posts.slice(0, 5).map(post => (
                                        <div key={post.id} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 p-6">
                                            <div className="flex items-center gap-3 mb-4">
                                                {/* Always use profile.user.avatar for posts in own profile */}
                                                {profile.user.avatar ? (
                                                    <Image
                                                        src={getSafeImageUrl(profile.user.avatar) as string}
                                                        alt="Author avatar"
                                                        width={40}
                                                        height={40}
                                                        className="w-10 h-10 rounded-full object-cover border border-gray-200 bg-white"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                                                        {profile.user.first_name && profile.user.last_name
                                                            ? `${profile.user.first_name.charAt(0)}${profile.user.last_name.charAt(0)}`.toUpperCase()
                                                            : profile.user.username.substring(0, 2).toUpperCase()
                                                        }
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-blue-700">{profile.user.username}</span>
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
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Followers Modal */}
            {showFollowersModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden border border-gray-200">
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-8 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                        <span className="text-2xl">👥</span>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold">Followers</h3>
                                        <p className="text-blue-100">{followers.length} follower{followers.length !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowFollowersModal(false)}
                                    className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-all duration-200"
                                >
                                    <span className="text-xl font-bold">✕</span>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 max-h-96 overflow-y-auto">
                            {followersLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                                    <span className="ml-3 text-gray-600 font-medium">Loading followers...</span>
                                </div>
                            ) : followers.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-4xl text-gray-400">👥</span>
                                    </div>
                                    <h4 className="text-xl font-semibold text-gray-800 mb-2">No followers yet</h4>
                                    <p className="text-gray-500">When people follow you, they&apos;ll appear here</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {followers.map((follower) => (
                                        <div key={follower.id} className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-4 hover:shadow-lg transition-all duration-300 border border-gray-200 hover:border-blue-300">
                                            <div className="flex items-center gap-4">
                                                <div className="cursor-pointer" onClick={() => viewUserProfile(follower.id)}>
                                                    {getSafeImageUrl(follower.avatar) ? (
                                                        <Image 
                                                            src={getSafeImageUrl(follower.avatar)!} 
                                                            alt={follower.username || 'User avatar'} 
                                                            width={50} 
                                                            height={50} 
                                                            className="rounded-full object-cover ring-2 ring-blue-200 hover:ring-blue-400 transition-all duration-200"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg ring-2 ring-blue-200 hover:ring-blue-400 transition-all duration-200">
                                                            {follower.first_name?.[0] || follower.username?.[0] || '?'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => viewUserProfile(follower.id)}>
                                                    <div className="font-bold text-gray-900 text-lg hover:text-blue-600 transition-colors duration-200">{follower.username}</div>
                                                    {(follower.first_name || follower.last_name) && (
                                                        <div className="text-gray-600 font-medium">
                                                            {follower.first_name} {follower.last_name}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => viewUserProfile(follower.id)}
                                                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                                                    >
                                                        <span className="text-sm">👤</span>
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => removeFollower(follower.id)}
                                                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                                                    >
                                                        <span className="text-sm">✕</span>
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Following Modal */}
            {showFollowingModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden border border-gray-200">
                        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-8 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                        <span className="text-2xl">🔗</span>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold">Following</h3>
                                        <p className="text-purple-100">{following.length} user{following.length !== 1 ? 's' : ''} followed</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowFollowingModal(false)}
                                    className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-all duration-200"
                                >
                                    <span className="text-xl font-bold">✕</span>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 max-h-96 overflow-y-auto">
                            {followingLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full"></div>
                                    <span className="ml-3 text-gray-600 font-medium">Loading following...</span>
                                </div>
                            ) : following.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-4xl text-gray-400">🔗</span>
                                    </div>
                                    <h4 className="text-xl font-semibold text-gray-800 mb-2">Not following anyone yet</h4>
                                    <p className="text-gray-500">Discover and follow users to see their posts</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {following.map((user) => (
                                        <div key={user.id} className="bg-gradient-to-r from-gray-50 to-purple-50 rounded-2xl p-4 hover:shadow-lg transition-all duration-300 border border-gray-200 hover:border-purple-300">
                                            <div className="flex items-center gap-4">
                                                <div className="cursor-pointer" onClick={() => viewUserProfile(user.id)}>
                                                    {(() => {
                                                        const safeUrl = getSafeImageUrl(user.avatar);
                                                        return safeUrl ? (
                                                            <Image 
                                                                src={safeUrl} 
                                                                alt={user.username} 
                                                                width={50} 
                                                                height={50} 
                                                                className="rounded-full object-cover ring-2 ring-purple-200 hover:ring-purple-400 transition-all duration-200" 
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLImageElement;
                                                                    target.style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg ring-2 ring-purple-200 hover:ring-purple-400 transition-all duration-200">
                                                                {user.first_name?.[0] || user.username?.[0] || '?'}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => viewUserProfile(user.id)}>
                                                    <div className="font-bold text-gray-900 text-lg hover:text-purple-600 transition-colors duration-200">{user.username}</div>
                                                    {(user.first_name || user.last_name) && (
                                                        <div className="text-gray-600 font-medium">
                                                            {user.first_name} {user.last_name}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => viewUserProfile(user.id)}
                                                        className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                                                    >
                                                        <span className="text-sm">👤</span>
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => unfollowUser(user.id)}
                                                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                                                    >
                                                        <span className="text-sm">🚫</span>
                                                        Unfollow
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Close Friends Modal */}
            {showCloseFriendsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden border border-gray-200">
                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                        <span className="text-2xl">💚</span>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold">Close Friends</h3>
                                        <p className="text-green-100">{closeFriends.length} close friend{closeFriends.length !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowCloseFriendsModal(false)}
                                    className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-all duration-200"
                                >
                                    <span className="text-xl font-bold">✕</span>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 max-h-96 overflow-y-auto">
                            {closeFriendsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin w-8 h-8 border-3 border-green-500 border-t-transparent rounded-full"></div>
                                    <span className="ml-3 text-gray-600 font-medium">Loading close friends...</span>
                                </div>
                            ) : closeFriends.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-4xl text-gray-400">💔</span>
                                    </div>
                                    <h4 className="text-xl font-semibold text-gray-800 mb-2">No close friends yet</h4>
                                    <p className="text-gray-500">Add your closest friends for special interactions</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {closeFriends.map((friend) => (
                                        <div key={friend.id} className="bg-gradient-to-r from-gray-50 to-green-50 rounded-2xl p-4 hover:shadow-lg transition-all duration-300 border border-gray-200 hover:border-green-300">
                                            <div className="flex items-center gap-4">
                                                <div className="cursor-pointer" onClick={() => viewUserProfile(friend.id)}>
                                                    {getSafeImageUrl(friend.avatar) ? (
                                                        <Image 
                                                            src={getSafeImageUrl(friend.avatar)!} 
                                                            alt={friend.username || 'User avatar'} 
                                                            width={50} 
                                                            height={50} 
                                                            className="rounded-full object-cover ring-2 ring-green-200 hover:ring-green-400 transition-all duration-200"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-lg ring-2 ring-green-200 hover:ring-green-400 transition-all duration-200">
                                                            {friend.first_name?.[0] || friend.username?.[0] || '?'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => viewUserProfile(friend.id)}>
                                                    <div className="font-bold text-gray-900 text-lg hover:text-green-600 transition-colors duration-200 flex items-center gap-2">
                                                        {friend.username}
                                                        <span className="text-green-500 text-sm">💚</span>
                                                    </div>
                                                    {(friend.first_name || friend.last_name) && (
                                                        <div className="text-gray-600 font-medium">
                                                            {friend.first_name} {friend.last_name}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => viewUserProfile(friend.id)}
                                                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                                                    >
                                                        <span className="text-sm">👤</span>
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => removeCloseFriend(friend.id)}
                                                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                                                    >
                                                        <span className="text-sm">💔</span>
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}