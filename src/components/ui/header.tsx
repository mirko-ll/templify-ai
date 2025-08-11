"use client"

import { useSession, signOut } from "next-auth/react"
import { Fragment, useState, useEffect } from "react"
import { Menu, Transition } from "@headlessui/react"
import { ChevronDownIcon, UserIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon, SparklesIcon } from "@heroicons/react/24/outline"
import Link from "next/link"
import Image from "next/image"

export default function Header() {
  const { data: session, status } = useSession()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut({ 
        callbackUrl: "/auth/signin",
        redirect: true 
      })
    } catch (error) {
      console.error('Sign out error:', error)
      // Force redirect even if sign out fails
      window.location.href = "/auth/signin"
    }
  }

  if (status === "loading") {
    return (
      <header className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/95 backdrop-blur-lg border-b border-gray-200/60 shadow-lg' 
          : 'bg-white border-b border-gray-100/30'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-18">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl animate-pulse">
                <SparklesIcon className="w-6 h-6 text-white" />
              </div>
              <span className="ml-3 text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                TemplAIto
              </span>
            </div>
            <div className="animate-pulse">
              <div className="h-10 w-10 bg-gray-300 rounded-full"></div>
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/95 backdrop-blur-lg border-b border-gray-200/60 shadow-lg' 
        : 'bg-white border-b border-gray-100/30'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18">
          {/* Logo - Matching home page design */}
          <Link href="/" className="flex items-center group">
            <div className={`w-12 h-12 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all duration-300 transform group-hover:scale-105 ${
              isScrolled ? 'shadow-lg' : 'shadow-xl'
            }`}>
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <span className="ml-3 text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent group-hover:from-indigo-700 group-hover:via-purple-700 group-hover:to-pink-700 transition-all duration-300">
              TemplAIto
            </span>
          </Link>

          {/* Navigation & User Menu */}
          <div className="flex items-center space-x-6">
            {/* Navigation Links (when logged in) */}
            {session?.user && (
              <nav className="hidden md:flex items-center space-x-8">
                <Link 
                  href="/" 
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors duration-200 relative group"
                >
                  Templates
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  href="/profile" 
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors duration-200 relative group"
                >
                  Profile
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:w-full transition-all duration-300"></span>
                </Link>
              </nav>
            )}

            {/* User Menu */}
            {session?.user ? (
              <Menu as="div" className="relative">
                <div>
                  <Menu.Button className="flex items-center space-x-3 hover:bg-white/60 hover:backdrop-blur-md rounded-2xl px-2 py-2 transition-all duration-300 group cursor-pointer focus:outline-none focus:ring-0">
                    {session.user.image ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name || "User"}
                        className="w-10 h-10 rounded-full ring-2 ring-white shadow-lg group-hover:ring-indigo-200 group-hover:shadow-xl transition-all duration-300"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
                        <UserIcon className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="hidden lg:block text-left">
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors duration-200">{session.user.name}</p>
                      <p className="text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-200">{session.user.email}</p>
                    </div>
                    <ChevronDownIcon className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-all duration-200 group-hover:rotate-180" />
                  </Menu.Button>
                </div>

                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-200"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-150"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 mt-3 w-64 bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none focus:ring-0 overflow-hidden">
                    <div className="py-2">
                      {/* Profile Section */}
                      <div className="px-4 py-4 border-b border-gray-100/60 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
                        <div className="flex items-center space-x-3">
                          {session.user.image ? (
                            <Image
                              src={session.user.image}
                              alt={session.user.name || "User"}
                              className="w-12 h-12 rounded-full ring-2 ring-white shadow-md"
                              width={48}
                              height={48}
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center shadow-md">
                              <UserIcon className="w-6 h-6 text-white" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{session.user.name}</p>
                            <p className="text-xs text-gray-500">{session.user.email}</p>
                          </div>
                        </div>
                      </div>

                      {/* Menu Items */}
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            href="/profile"
                            className={`${
                              active ? "bg-gradient-to-r from-indigo-50 to-purple-50" : ""
                            } group flex items-center px-4 py-3 text-sm text-gray-700 hover:text-gray-900 transition-all duration-200`}
                          >
                            <div className="w-8 h-8 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center mr-3 group-hover:from-indigo-200 group-hover:to-purple-200 transition-all duration-200">
                              <Cog6ToothIcon className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                              <p className="font-medium">Profile Settings</p>
                              <p className="text-xs text-gray-500">Manage your account</p>
                            </div>
                          </Link>
                        )}
                      </Menu.Item>

                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={handleSignOut}
                            className={`${
                              active ? "bg-red-50" : ""
                            } group flex w-full items-center px-4 py-3 text-sm text-gray-700 hover:text-red-600 transition-all duration-200 cursor-pointer`}
                          >
                            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center mr-3 group-hover:bg-red-200 transition-all duration-200">
                              <ArrowRightOnRectangleIcon className="h-4 w-4 text-red-600" />
                            </div>
                            <div>
                              <p className="font-medium">Sign out</p>
                              <p className="text-xs text-gray-500">See you soon!</p>
                            </div>
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            ) : (
              <Link
                href="/auth/signin"
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center space-x-2"
              >
                <span>Sign In</span>
                <SparklesIcon className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}