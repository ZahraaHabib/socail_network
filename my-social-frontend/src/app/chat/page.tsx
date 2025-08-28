"use client";
import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import PrivateMessaging from '../../components/PrivateMessaging';

export default function ChatPage() {
  const { isAuthenticated, loading } = useAuth();
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userResponse = await fetch('http://localhost:8080/v2/users/me', {
          credentials: 'include'
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUserId(userData.user.id);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };
    fetchUserData();
  }, []);

  if (loading) {
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
          Please log in to access chat.
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
        <div
          className="flex flex-col items-center justify-center min-h-[80vh] py-8 px-2"
          style={{ background: 'var(--background)', color: 'var(--foreground)' }}
        >
          <div className="w-full max-w-5xl flex flex-col h-[70vh]">
            {currentUserId && <PrivateMessaging currentUserId={currentUserId} />}
          </div>
        </div>
    </>
  );
}
