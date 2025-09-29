"use client";

import { useSession, signOut } from "next-auth/react";
import { Fragment, useState, useEffect } from "react";
import { Menu, Transition } from "@headlessui/react";
import {
  ChevronDownIcon,
  UserIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  SparklesIcon,
  CommandLineIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import Image from "next/image";

export default function Header() {
  const { data: session, status } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut({ callbackUrl: "/auth/signin", redirect: true });
    } catch (error) {
      console.error("Sign out error:", error);
      window.location.href = "/auth/signin";
    }
  };

  const headerClasses = `sticky top-0 z-50 transition-all duration-300 ${
    isScrolled
      ? "bg-white/95 backdrop-blur-lg border-b border-gray-200/60 shadow-lg"
      : "bg-white border-b border-gray-100/30"
  }`;

  if (status === "loading") {
    return (
      <header className={headerClasses}>
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
              <div className="h-10 w-10 bg-gray-300 rounded-full" />
            </div>
          </div>
        </div>
      </header>
    );
  }

  const isAdmin = Boolean(((session as any)?.user as any)?.isAdmin);

  return (
    <header className={headerClasses}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18">
          <Link href="/" className="flex items-center group">
            <div
              className={`w-12 h-12 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all duration-300 transform group-hover:scale-105 ${
                isScrolled ? "shadow-lg" : "shadow-xl"
              }`}
            >
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <span className="ml-3 text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent group-hover:from-indigo-700 group-hover:via-purple-700 group-hover:to-pink-700 transition-all duration-300">
              TemplAIto
            </span>
          </Link>

          <div className="flex items-center space-x-6">
            {session?.user && (
              <nav className="hidden md:flex items-center space-x-8">
                <Link
                  href="/app"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors duration-200 relative group"
                >
                  Create Templates
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:w-full transition-all duration-300" />
                </Link>
                <Link
                  href="/clients"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors duration-200 relative group"
                >
                  Clients
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:w-full transition-all duration-300" />
                </Link>
                <Link
                  href="/campaigns"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors duration-200 relative group"
                >
                  Campaigns
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:w-full transition-all duration-300" />
                </Link>
                <Link
                  href="/profile"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors duration-200 relative group"
                >
                  Profile
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:w-full transition-all duration-300" />
                </Link>
              </nav>
            )}

            {session?.user ? (
              <Menu as="div" className="relative">
                <div>
                  <Menu.Button className="flex items-center space-x-3 hover:bg-white/60 hover:backdrop-blur-md rounded-2xl px-2 py-2 transition-all duration-300 group cursor-pointer focus:outline-none focus:ring-0">
                    {session.user.image ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name || session.user.email || "User avatar"}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full border border-indigo-100"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center">
                        <UserIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">
                        {session.user.name || "Account"}
                      </p>
                      <p className="text-xs text-gray-500">{session.user.email}</p>
                    </div>
                    <ChevronDownIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition" />
                  </Menu.Button>
                </div>

                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl bg-white py-2 shadow-2xl ring-1 ring-black/5 focus:outline-none">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        {session.user.image ? (
                          <Image
                            src={session.user.image}
                            alt={session.user.name || session.user.email || "User avatar"}
                            width={44}
                            height={44}
                            className="w-11 h-11 rounded-full border border-indigo-100"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center">
                            <UserIcon className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {session.user.name || "Account"}
                          </p>
                          <p className="text-xs text-gray-500">{session.user.email}</p>
                        </div>
                      </div>
                    </div>

                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          href="/clients"
                          className={`${
                            active ? "bg-gradient-to-r from-indigo-50 to-purple-50" : ""
                          } group flex items-center px-4 py-3 text-sm text-gray-700 hover:text-gray-900 transition-all duration-200`}
                        >
                          <div className="w-8 h-8 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center mr-3 group-hover:from-indigo-200 group-hover:to-purple-200 transition-all duration-200">
                            <UserIcon className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-medium">Clients</p>
                            <p className="text-xs text-gray-500">Manage client workspaces</p>
                          </div>
                        </Link>
                      )}
                    </Menu.Item>

                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          href="/campaigns"
                          className={`${
                            active ? "bg-gradient-to-r from-purple-50 to-pink-50" : ""
                          } group flex items-center px-4 py-3 text-sm text-gray-700 hover:text-gray-900 transition-all duration-200`}
                        >
                          <div className="w-8 h-8 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg flex items-center justify-center mr-3 group-hover:from-purple-200 group-hover:to-pink-200 transition-all duration-200">
                            <SparklesIcon className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium">Campaigns</p>
                            <p className="text-xs text-gray-500">Monitor SqualoMail deliveries</p>
                          </div>
                        </Link>
                      )}
                    </Menu.Item>

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

                    {isAdmin && (
                      <>
                        <div className="border-t border-gray-100/60 my-1" />
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              href="/admin/prompts"
                              className={`${
                                active ? "bg-gradient-to-r from-purple-50 to-pink-50" : ""
                              } group flex items-center px-4 py-3 text-sm text-gray-700 hover:text-gray-900 transition-all duration-200`}
                            >
                              <div className="w-8 h-8 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg flex items-center justify-center mr-3 group-hover:from-purple-200 group-hover:to-pink-200 transition-all duration-200">
                                <CommandLineIcon className="h-4 w-4 text-purple-600" />
                              </div>
                              <div>
                                <p className="font-medium">Prompt Generator</p>
                                <p className="text-xs text-gray-500">Admin panel & tools</p>
                              </div>
                            </Link>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              href="/admin/countries"
                              className={`${
                                active ? "bg-gradient-to-r from-blue-50 to-indigo-50" : ""
                              } group flex items-center px-4 py-3 text-sm text-gray-700 hover:text-gray-900 transition-all duration-200`}
                            >
                              <div className="w-8 h-8 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center mr-3 group-hover:from-blue-200 group-hover:to-indigo-200 transition-all duration-200">
                                <GlobeAltIcon className="h-4 w-4 text-indigo-600" />
                              </div>
                              <div>
                                <p className="font-medium">Countries</p>
                                <p className="text-xs text-gray-500">Manage supported regions</p>
                              </div>
                            </Link>
                          )}
                        </Menu.Item>
                        <div className="border-t border-gray-100/60 my-1" />
                      </>
                    )}

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
  );
}
