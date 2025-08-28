'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/feed');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">Social Network</h1>
          <p className="text-gray-600 mb-8">Connect with friends and share your moments</p>
        </div>
        
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="space-y-4">
            <Link 
              href="/login" 
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition block text-center"
            >
              Sign In
            </Link>
            
            <Link 
              href="/register" 
              className="w-full bg-white text-blue-600 py-3 px-4 rounded-lg font-semibold border border-blue-600 hover:bg-blue-50 transition block text-center"
            >
              Create Account
            </Link>
          </div>
        </div>
        
        <div className="text-center text-sm text-gray-500">
          <p>Join our community and stay connected with your friends!</p>
        </div>
      </div>
    </div>
  );
}
