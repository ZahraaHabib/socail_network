import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-200 via-purple-100 to-blue-200 relative overflow-hidden">
      {/* Animated floating shapes */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="animate-spin-slow absolute left-10 top-10 w-32 h-32 bg-indigo-300 rounded-full opacity-30 blur-2xl" />
        <div className="animate-pulse absolute right-20 bottom-20 w-40 h-40 bg-purple-300 rounded-full opacity-20 blur-2xl" />
        <div className="animate-bounce absolute left-1/2 top-1/3 w-24 h-24 bg-blue-300 rounded-full opacity-20 blur-2xl" />
      </div>
      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 drop-shadow-lg mb-4">404</h1>
        <h2 className="text-3xl font-semibold text-gray-700 mb-4">Page Not Found</h2>
        <p className="text-lg text-gray-500 mb-8 text-center max-w-md">Sorry, the page you are looking for does not exist.</p>
        <Link href="/" className="px-8 py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 text-white rounded-full shadow-lg hover:scale-105 hover:shadow-xl transition-all duration-200 font-semibold">Go Home</Link>
      </div>
    </div>
  );
}
