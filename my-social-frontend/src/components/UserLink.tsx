'use client';

import Link from 'next/link';
import Image from 'next/image';
import { getSafeImageUrl } from '../utils/imageUtils';

interface UserLinkProps {
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    showAvatar?: boolean;
    showFullName?: boolean;
    showUsername?: boolean; // New prop to control username display
    className?: string;
    avatarSize?: number;
    isCurrentUser?: boolean; // New prop to handle current user
}

export default function UserLink({
    userId,
    username,
    firstName,
    lastName,
    avatar,
    showAvatar = false,
    showFullName = false,
    showUsername = true,
    className = '',
    avatarSize = 32,
    isCurrentUser = false // Default to false
}: UserLinkProps) {
    const displayName = showFullName && firstName && lastName 
        ? `${firstName} ${lastName}` 
        : username;

    // Use the shared utility function to get a safe avatar URL
    const avatarUrl = getSafeImageUrl(avatar);

    // Navigate to /profile for current user, /profile/userId for others
    const profilePath = isCurrentUser ? '/profile' : `/profile/${userId}`;

    return (
        <Link 
            href={profilePath}
            className={`inline-flex items-center gap-2 hover:text-blue-600 transition-colors ${className}`}
        >
            {showAvatar && (
                <div className="flex-shrink-0">
                    {avatarUrl ? (
                        <Image
                            src={avatarUrl}
                            alt={`${username}'s avatar`}
                            width={avatarSize}
                            height={avatarSize}
                            className="rounded-full object-cover border-2 border-gray-200"
                            onError={(e) => {
                                console.log('Avatar image failed to load:', avatarUrl);
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    ) : (
                        <div 
                            className="rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold border-2 border-gray-200"
                            style={{ 
                                width: avatarSize, 
                                height: avatarSize,
                                fontSize: avatarSize * 0.4 
                            }}
                            title={`Fallback avatar for ${username}`}
                        >
                            {firstName?.[0] || username?.[0] || '?'}
                        </div>
                    )}
                </div>
            )}
            {showUsername && <span>{displayName}</span>}
        </Link>
    );
}
