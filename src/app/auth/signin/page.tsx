"use client";

import { signIn, getSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  SparklesIcon,
  CheckIcon,
  ArrowRightIcon,
  StarIcon,
} from "@heroicons/react/24/solid";
import {
  BoltIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        router.push("/");
      }
    });
  }, [router]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch (error) {
      console.error("Sign in error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 relative overflow-hidden">
      {/* Enhanced Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 -right-4 w-96 h-96 bg-gradient-to-bl from-indigo-200/30 to-purple-200/30 rounded-full mix-blend-multiply filter blur-3xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 -left-4 w-96 h-96 bg-gradient-to-tr from-purple-200/30 to-pink-200/30 rounded-full mix-blend-multiply filter blur-3xl animate-pulse animation-delay-4000"></div>
        <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-gradient-to-br from-pink-200/20 to-indigo-200/20 rounded-full mix-blend-multiply filter blur-3xl animate-pulse animation-delay-1000"></div>
      </div>

      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - Hero Content */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <div className="max-w-lg">
            {/* Logo */}
            <div className="flex items-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl mr-4 animate-pulse">
                <SparklesIcon className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                TemplAIto
              </h1>
            </div>

            {/* Hero Title */}
            <h2 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Transform
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                {" "}
                URLs{" "}
              </span>
              into Stunning
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {" "}
                Email Templates
              </span>
            </h2>

            {/* Subtitle */}
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              AI-powered email template generator that creates
              conversion-optimized designs in seconds. Join thousands of
              marketers already using TemplAIto.
            </p>

            {/* Features */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <CheckIcon className="w-4 h-4 text-white" />
                </div>
                <span className="text-gray-700 font-medium">
                  9 Professional Template Styles
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                  <BoltIcon className="w-4 h-4 text-white" />
                </div>
                <span className="text-gray-700 font-medium">
                  AI-Powered Content Generation
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <GlobeAltIcon className="w-4 h-4 text-white" />
                </div>
                <span className="text-gray-700 font-medium">
                  Multi-Language Support
                </span>
              </div>
            </div>

            {/* Social Proof */}
            <div className="flex items-center space-x-2 mb-8">
              <div className="flex -space-x-2">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
                  alt="User testimonial"
                  className="w-8 h-8 rounded-full border-2 border-white object-cover"
                />
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face"
                  alt="User testimonial"
                  className="w-8 h-8 rounded-full border-2 border-white object-cover"
                />
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"
                  alt="User testimonial"
                  className="w-8 h-8 rounded-full border-2 border-white object-cover"
                />
                <img
                  src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face"
                  alt="User testimonial"
                  className="w-8 h-8 rounded-full border-2 border-white object-cover"
                />
                <img
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face"
                  alt="User testimonial"
                  className="w-8 h-8 rounded-full border-2 border-white object-cover"
                />
              </div>
              <div className="ml-3">
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="w-4 h-4 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600">
                  Trusted by 10,000+ marketers
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md">
            {/* Login Card */}
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/30 p-8 relative">
              {/* Decorative Elements */}
              <div className="absolute -top-2 -right-2 w-20 h-20 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-gradient-to-tr from-pink-400/20 to-indigo-400/20 rounded-full blur-2xl"></div>

              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                  <ShieldCheckIcon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Get Started Free
                </h3>
                <p className="text-gray-600">
                  Create your first template in under 30 seconds
                </p>
              </div>

              {/* Benefits */}
              <div className="mb-8 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
                <h4 className="font-semibold text-gray-900 mb-3 text-center">
                  What you get instantly:
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-sm text-gray-700">
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Unlimited template generations</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-700">
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Professional email designs</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-700">
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Mobile-responsive templates</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-700">
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Export ready HTML code</span>
                  </div>
                </div>
              </div>

              {/* Google Sign In Button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none group"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                ) : (
                  <>
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Start Creating with Google</span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>

              {/* Trust Indicators */}
              <div className="mt-6 text-center">
                <div className="flex items-center justify-center space-x-4 mb-3">
                  <div className="flex items-center space-x-1">
                    <ShieldCheckIcon className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-gray-600">Secure</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <BoltIcon className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs text-gray-600">Instant</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <GlobeAltIcon className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-gray-600">Global</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Free trial • No credit card required • GDPR compliant
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .animation-delay-1000 {
          animation-delay: 1s;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
