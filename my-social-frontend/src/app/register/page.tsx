'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

type FormData = {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  avatar: string; // base64 string
  aboutMe: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    email: '',
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    avatar: '',
    aboutMe: '',
  });
  const [step, setStep] = useState(1); // 1: Account, 2: Profile
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setFormData((prev) => ({ ...prev, avatar: base64 }));
      setAvatarPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  // Step validation
  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.email.includes('@')) newErrors.email = 'Valid email required';
      if (!formData.username) newErrors.username = 'Username required';
      if (!formData.password || formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    } else if (step === 2) {
      if (!formData.firstName) newErrors.firstName = 'First name required';
      if (!formData.lastName) newErrors.lastName = 'Last name required';
      if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!validateStep()) return;
    setStep(step + 1);
  };

  const handleBack = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setStep(step - 1);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!validateStep()) return;
    setIsLoading(true);

    // Prepare payload for backend
    const payload = {
      email: formData.email,
      username: formData.username,
      password_hash: formData.password, // matches backend RegisterRequest
      first_name: formData.firstName,
      last_name: formData.lastName,
      date_of_birth: formData.dateOfBirth,
      avatar: formData.avatar,
      about_me: formData.aboutMe,
    };

    try {
      const response = await fetch('http://localhost:8080/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      setIsLoading(false);

      if (response.ok) {
        router.push('/login');
      } else {
        let errorMsg = `Registration failed: ${response.status}`;
        try {
          const errorText = await response.text();
          errorMsg = errorText || errorMsg;
        } catch {}
        setSubmitError(errorMsg);
      }
    } catch {
      setIsLoading(false);
      setSubmitError('Network error. Please try again.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-300 via-white to-purple-200">
      <form
        onSubmit={step === 2 ? handleSubmit : handleNext}
        className="bg-white p-7 rounded-2xl shadow-2xl w-full max-w-sm border border-blue-100 flex flex-col gap-5"
      >
        <h2 className="text-2xl font-extrabold mb-1 text-center text-blue-700 tracking-tight">Create your account</h2>
        <p className="text-center text-blue-400 mb-2 text-base">Join the network and connect with friends</p>
        {submitError && (
          <div className="mb-2 text-red-600 text-center font-semibold bg-red-50 border border-red-200 rounded-lg py-2 px-3">{submitError}</div>
        )}

        {/* Stepper indicator */}
        <div className="flex justify-center mb-2 gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${step === 1 ? 'bg-blue-500' : 'bg-blue-200'}`}></div>
          <div className={`w-2.5 h-2.5 rounded-full ${step === 2 ? 'bg-blue-500' : 'bg-blue-200'}`}></div>
        </div>

        {step === 1 && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-blue-700 font-semibold text-sm" htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                value={formData.username}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
              {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-blue-700 font-semibold text-sm" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
            <div className="flex flex-col gap-1 mb-1">
              <label className="text-blue-700 font-semibold text-sm" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all text-lg tracking-wide disabled:opacity-50 mt-1"
              disabled={isLoading}
            >
              Next
            </button>
          </>
        )}

        {step === 2 && (
          <>
            {/* Avatar Upload */}
            <div className="flex flex-col items-center mb-1">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-blue-200 mb-1 bg-white flex items-center justify-center shadow-sm">
                {avatarPreview ? (
                  <Image src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" width={64} height={64} />
                ) : (
                  <span className="text-blue-300 text-xs">No Avatar</span>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="text-xs text-blue-700"
                disabled={isLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-1">
              <div className="flex flex-col gap-1">
                <label className="text-blue-700 font-semibold text-sm" htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
                {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-blue-700 font-semibold text-sm" htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
                {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1 mb-1">
              <label className="text-blue-700 font-semibold text-sm" htmlFor="dateOfBirth">Date of Birth</label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                value={formData.dateOfBirth}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
              {errors.dateOfBirth && <p className="text-xs text-red-500">{errors.dateOfBirth}</p>}
            </div>

            <div className="flex flex-col gap-1 mb-2">
              <label className="text-blue-700 font-semibold text-sm" htmlFor="aboutMe">About Me (optional)</label>
              <textarea
                id="aboutMe"
                name="aboutMe"
                className="w-full border-2 border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-base px-3 py-2 rounded-xl placeholder-blue-300 transition-all outline-none"
                value={formData.aboutMe}
                onChange={handleChange}
                rows={2}
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="w-1/2 bg-blue-100 text-blue-700 py-3 rounded-xl font-bold shadow hover:bg-blue-200 transition-all text-base tracking-wide disabled:opacity-50"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="submit"
                className="w-1/2 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all text-base tracking-wide disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? 'Registering...' : 'Register'}
              </button>
            </div>
          </>
        )}

        <div className="mt-2 text-center text-sm text-blue-500">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-700 hover:underline font-bold">
            Login
          </Link>
        </div>
      </form>
    </div>
  );
}