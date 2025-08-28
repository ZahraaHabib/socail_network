'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { setIsAuthenticated } = useAuth();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Log the payload for debugging
      console.log('Submitting login:', formData);

      const response = await fetch('http://localhost:8080/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include',
      });

      // Log response status and headers
      console.log('Response status:', response.status);
      console.log('Response headers:', Array.from(response.headers.entries()));

      const text = await response.text();
      console.log('Response body:', text);

      setIsLoading(false);

      if (response.ok) {
        // Update authentication state
        setIsAuthenticated(true);
        // Redirect to feed
        router.push('/feed');
      } else {
        setError(text || `Login failed: ${response.status}`);
      }
    } catch (err: unknown) {
      setIsLoading(false);
      setError('Network error. Please try again.');
      if (err instanceof Error) {
        console.error('Login error:', err.message);
      } else {
        console.error('Login error:', err);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-300 via-white to-purple-200">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-7 rounded-2xl shadow-2xl w-full max-w-sm border border-blue-100 flex flex-col gap-6 items-center"
      >
        <h2 className="text-3xl font-extrabold mb-0 text-center text-blue-700 tracking-tight drop-shadow-sm">Login</h2>
        <div className="w-10 h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mb-2"></div>
        {error && (
          <div className="mb-2 text-red-600 text-center font-semibold bg-red-50 border border-red-200 rounded-lg py-2 px-3 w-full">{error}</div>
        )}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-blue-700 font-semibold" htmlFor="username">
            Username or Email
          </label>
          <input
            id="username"
            name="username"
            type="text"
            className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-4 py-2.5 rounded-xl placeholder-blue-300 transition-all outline-none"
            value={formData.username}
            onChange={handleChange}
            placeholder="Enter your username or email"
            required
            disabled={isLoading}
            autoComplete="username"
          />
        </div>
        <div className="flex flex-col gap-2 w-full">
          <label className="text-blue-700 font-semibold" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-4 py-2.5 rounded-xl placeholder-blue-300 transition-all outline-none"
            value={formData.password}
            onChange={handleChange}
            required
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all text-lg tracking-wide disabled:opacity-50 mt-2"
          disabled={isLoading}
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
        <div className="mt-2 text-center text-base text-blue-500 w-full">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-700 hover:underline font-bold">
            Register
          </Link>
        </div>
      </form>
    </div>
  );
}