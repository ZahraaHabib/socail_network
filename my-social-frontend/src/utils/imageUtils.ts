/**
 * Utility function to safely construct image URLs for avatars and other images
 * Handles various URL formats: base64 data URLs, HTTP URLs, and local paths
 * 
 * @param imageUrl - The image URL/path to process
 * @returns A valid image URL or null if invalid
 */
export function getSafeImageUrl(imageUrl: string | undefined | null): string | null {
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
        return null;
    }
    
    try {
        // If it's a data URL (base64), return it directly
        if (imageUrl.startsWith('data:image/')) {
            return imageUrl;
        }
        
        // If it's already a full URL, validate and return it
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            new URL(imageUrl); // Validate URL
            return imageUrl;
        }
        
        // Construct local URL if it's a path
        if (imageUrl.startsWith('/')) {
            const fullUrl = `http://localhost:8080${imageUrl}`;
            new URL(fullUrl); // Validate URL
            return fullUrl;
        }
        
        // If it doesn't start with /, add it
        const fullUrl = `http://localhost:8080/${imageUrl}`;
        new URL(fullUrl); // Validate URL
        return fullUrl;
    } catch (error) {
        console.warn('Invalid image URL:', imageUrl, error);
        return null;
    }
}

/**
 * Legacy function for backward compatibility
 * Checks if an avatar URL is valid and formats it for display
 * 
 * @param avatar - The avatar URL/path to process
 * @returns A valid avatar URL or null if invalid
 */
export function getAvatarUrl(avatar: string | undefined | null): string | null {
    return getSafeImageUrl(avatar);
}
