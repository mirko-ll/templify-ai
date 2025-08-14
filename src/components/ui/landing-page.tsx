"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  StarIcon,
  CheckIcon,
  ArrowRightIcon,
  BoltIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  PlayIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/solid";
import { BeakerIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

export default function LandingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0); // 0-1 overall progress (seamless)
  const [wizardStep, setWizardStep] = useState(0); // 0: URL typing, 1: analyzing, 2: template select, 3: generating, 4: complete
  const [typedUrl, setTypedUrl] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(-1);
  const [countdown, setCountdown] = useState(0);
  const [restartProgress, setRestartProgress] = useState(0);
  const targetData = [
    { month: "Day 1", value: 5000, label: "$5,000/month" },
    { month: "Week 1", value: 6500, label: "$6,500/month" },
    { month: "Week 2", value: 8200, label: "$8,200/month" },
    { month: "Week 3", value: 10500, label: "$10,500/month" },
    { month: "Month 1", value: 14000, label: "$14,000/month" },
    { month: "Month 2", value: 22000, label: "$22,000/month" },
  ];

  useEffect(() => {
    setIsVisible(true);

    // Crypto-style fast rising animation
    const animateChart = () => {
      const totalDuration = 3000; // 3 seconds - faster like crypto apps
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / totalDuration, 1);

        // Smooth cubic bezier easing (ease-in-out)
        const easedProgress =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        setAnimationProgress(Math.min(easedProgress, 1));

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      animate();
    };

    setTimeout(animateChart, 1000);

    // Wizard Demo Animation
    const runWizardDemo = () => {
      const fullUrl = "https://shop.watersplash.com/ultimate-water-gun";
      let currentStep = 0;
      let urlProgress = 0;
      let countdownInterval: NodeJS.Timeout | null = null;

      const wizardSequence = () => {
        // Reset states at the beginning of each cycle
        if (currentStep === 0) {
          setCountdown(0);
          setRestartProgress(0);
          setTypedUrl("");
          setSelectedTemplate(-1);
        }

        switch (currentStep) {
          case 0: // URL Typing
            setWizardStep(0);
            setTypedUrl("");
            setSelectedTemplate(-1);

            const typeUrl = () => {
              if (urlProgress < fullUrl.length) {
                setTypedUrl(fullUrl.substring(0, urlProgress + 1));
                urlProgress++;
                setTimeout(typeUrl, 100);
              } else {
                setTimeout(() => {
                  currentStep = 1;
                  setTimeout(wizardSequence, 500);
                }, 1000);
              }
            };
            typeUrl();
            break;

          case 1: // Analyzing
            setWizardStep(1);
            setTimeout(() => {
              currentStep = 2;
              setTimeout(wizardSequence, 2000);
            }, 0);
            break;

          case 2: // Template Selection
            setWizardStep(2);
            setTimeout(() => {
              setSelectedTemplate(1); // Select promotional
              setTimeout(() => {
                currentStep = 3;
                setTimeout(wizardSequence, 1500);
              }, 1000);
            }, 1000);
            break;

          case 3: // Generating
            setWizardStep(3);
            setTimeout(() => {
              currentStep = 4;
              setTimeout(wizardSequence, 3000);
            }, 0);
            break;

          case 4: // Complete
            setWizardStep(4);

            // Clear any existing interval
            if (countdownInterval) {
              clearInterval(countdownInterval);
            }

            // 10-second countdown with progress indicator
            let timeLeft = 20;
            setCountdown(timeLeft);
            setRestartProgress(0);

            countdownInterval = setInterval(() => {
              timeLeft--;
              console.log(
                "Countdown:",
                timeLeft,
                "Progress:",
                ((20 - timeLeft) / 20) * 100
              );
              setCountdown(timeLeft);
              setRestartProgress(((20 - timeLeft) / 20) * 100);

              if (timeLeft <= 0) {
                if (countdownInterval) {
                  clearInterval(countdownInterval);
                }
                countdownInterval = null;
                // Restart the sequence
                currentStep = 0;
                urlProgress = 0;
                setCountdown(0);
                setRestartProgress(0);
                setTypedUrl("");
                setSelectedTemplate(-1);
                setTimeout(wizardSequence, 1000);
              }
            }, 1000);
            break;
        }
      };

      wizardSequence();
    };

    setTimeout(runWizardDemo, 2000);
  }, []);

  const handleGetStarted = () => {
    if (status === "authenticated") {
      router.push("/app");
    } else {
      router.push("/auth/signin");
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: "smooth" });
  };

  // Generate complete path for Chart.js style animation
  const generateCompletePath = () => {
    const maxValue = Math.max(...targetData.map((d) => d.value));
    const width = 400;
    const padding = 40;

    const points = targetData.map((item, index) => {
      const x =
        padding + (index * (width - 2 * padding)) / (targetData.length - 1);
      const y = 150 - ((item.value - 5000) / (maxValue - 5000)) * 120;
      return { x, y };
    });

    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const cp1x = prev.x + (current.x - prev.x) / 3;
      const cp1y = prev.y;
      const cp2x = current.x - (current.x - prev.x) / 3;
      const cp2y = current.y;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${current.x} ${current.y}`;
    }

    return path;
  };

  return (
    <div className="relative min-h-screen bg-white text-gray-900 overflow-hidden">
      {/* Clean, User-Friendly Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Soft Gradient Orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-indigo-50 via-purple-50 to-pink-50 rounded-full blur-3xl opacity-60 animate-pulse animation-delay-0"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-blue-50 via-indigo-50 to-purple-50 rounded-full blur-3xl opacity-60 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 rounded-full blur-3xl opacity-40 animate-pulse animation-delay-4000"></div>

        {/* Subtle Geometric Shapes */}
        <div className="absolute top-20 left-10 w-4 h-4 bg-indigo-200/30 rounded-full animate-bounce animation-delay-1000"></div>
        <div className="absolute top-40 right-20 w-3 h-3 bg-purple-200/30 rounded-full animate-bounce animation-delay-3000"></div>
        <div className="absolute bottom-32 left-32 w-2 h-2 bg-pink-200/30 rounded-full animate-bounce animation-delay-2000"></div>
        <div className="absolute bottom-20 right-40 w-3 h-3 bg-blue-200/30 rounded-full animate-bounce animation-delay-4000"></div>

        {/* Clean Lines */}
        <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-100/40 to-transparent"></div>
        <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-100/40 to-transparent"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-3 lg:px-8 bg-white/95 backdrop-blur-xl border-b border-gray-100/50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            TemplAIto
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleGetStarted}
            className="px-6 cursor-pointer py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Get Started Free
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              {/* Badge */}
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/50 rounded-full transition-all duration-1000 ${
                  isVisible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-10 opacity-0"
                }`}
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium bg-gradient-to-r from-indigo-700 to-purple-700 bg-clip-text text-transparent">
                  Used by 50,000+ marketers worldwide
                </span>
              </div>

              {/* Main Headline */}
              <h1
                className={`text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight transition-all duration-1000 delay-200 ${
                  isVisible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-10 opacity-0"
                }`}
              >
                Transform Any URL Into
                <br />
                <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  High-Converting Emails
                </span>
              </h1>

              {/* Subheadline */}
              <p
                className={`text-lg lg:text-xl text-gray-600 leading-relaxed max-w-lg transition-all duration-1000 delay-400 ${
                  isVisible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-10 opacity-0"
                }`}
              >
                AI-powered email template generator that creates professional,
                conversion-optimized designs from any product URL in just{" "}
                <span className="font-semibold text-indigo-600">
                  30 seconds
                </span>
                .
              </p>

              {/* CTA Buttons */}
              <div
                className={`flex flex-col sm:flex-row items-start gap-4 transition-all duration-1000 delay-600 ${
                  isVisible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-10 opacity-0"
                }`}
              >
                <button
                  onClick={handleGetStarted}
                  className="group cursor-pointer px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
                >
                  <span className="flex items-center gap-3">
                    <RocketLaunchIcon className="w-6 h-6" />
                    Start Creating for Free
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </span>
                </button>

                <button
                  onClick={() => scrollToSection("demo")}
                  className="group cursor-pointer flex items-center gap-3 px-8 py-4 border-2 border-gray-200 hover:border-gray-300 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-all duration-300"
                >
                  <PlayIcon className="w-5 h-5 text-indigo-600" />
                  Watch Demo
                </button>
              </div>

              {/* Trust indicators */}
              <div
                className={`flex items-center gap-6 text-sm text-gray-500 transition-all duration-1000 delay-800 ${
                  isVisible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-10 opacity-0"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  Free trial
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  Setup in 30 seconds
                </div>
              </div>
            </div>

            {/* Right Column - Dynamic Growth Chart */}
            <div
              className={`transition-all duration-1000 delay-1000 ${
                isVisible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0"
              }`}
            >
              <div className="relative">
                {/* Dynamic Results Dashboard */}
                <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-gray-200/50 shadow-2xl p-8 relative overflow-hidden">
                  {/* Subtle animated background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/30 via-purple-50/30 to-pink-50/30"></div>

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full mb-4">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-semibold text-green-700">
                          Live Customer Results
                        </span>
                      </div>
                      <h3 className="text-3xl font-bold text-gray-900 mb-3">
                        🚀 Watch Your Revenue{" "}
                        <span className="text-green-600">Explode</span>
                      </h3>
                      <p className="text-lg text-gray-600">
                        See what happens when you switch to TemplAIto&apos;s
                        professional email templates
                      </p>
                    </div>

                    {/* Simple Chart Container */}
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                      <svg
                        width="100%"
                        height="200"
                        viewBox="0 0 400 180"
                        className="overflow-visible"
                      >
                        {/* Y-axis values */}
                        {[25000, 20000, 15000, 10000, 5000].map((value, i) => {
                          const y = 30 + i * 24;
                          return (
                            <g key={value}>
                              <line
                                x1="40"
                                y1={y}
                                x2="360"
                                y2={y}
                                stroke="#f3f4f6"
                                strokeWidth="1"
                              />
                              <text
                                x="30"
                                y={y + 4}
                                textAnchor="end"
                                className="text-xs fill-gray-400 font-medium"
                              >
                                ${(value / 1000).toFixed(0)}k
                              </text>
                            </g>
                          );
                        })}

                        {/* Simple Gradients */}
                        <defs>
                          <linearGradient
                            id="areaGradient"
                            x1="0%"
                            y1="0%"
                            x2="0%"
                            y2="100%"
                          >
                            <stop
                              offset="0%"
                              stopColor="#10b981"
                              stopOpacity="0.2"
                            />
                            <stop
                              offset="100%"
                              stopColor="#10b981"
                              stopOpacity="0.02"
                            />
                          </linearGradient>
                        </defs>

                        {/* Chart.js Style Line Animation */}
                        {(() => {
                          const completePath = generateCompletePath();
                          if (!completePath) return null;

                          // Calculate path length for smooth animation
                          const pathLength = 800; // approximate length
                          const strokeDasharray = pathLength;
                          const strokeDashoffset =
                            pathLength * (1 - animationProgress);

                          return (
                            <>
                              {/* Area fill that follows the line */}
                              <path
                                d={`${completePath} L ${
                                  40 + animationProgress * 320
                                } 150 L 40 150 Z`}
                                fill="url(#areaGradient)"
                                opacity={animationProgress * 0.6}
                              />

                              {/* Main line with stroke-dashoffset animation */}
                              <path
                                d={completePath}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                              />
                            </>
                          );
                        })()}

                        {/* X-axis Labels */}
                        {targetData.map((item, index) => {
                          const x =
                            40 + (index * 320) / (targetData.length - 1);
                          return (
                            <text
                              key={index}
                              x={x}
                              y="170"
                              textAnchor="middle"
                              className="text-xs fill-gray-500 font-medium"
                            >
                              {item.month}
                            </text>
                          );
                        })}
                      </svg>
                    </div>

                    {/* Key Results */}
                    <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                      <div className="grid md:grid-cols-3 gap-6 text-center">
                        <div>
                          <div className="text-2xl font-bold text-green-600 mb-1">
                            340%
                          </div>
                          <div className="text-sm text-green-700 font-medium">
                            Revenue Growth
                          </div>
                          <div className="text-xs text-green-600/80">
                            In just 2 months
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600 mb-1">
                            $17,000
                          </div>
                          <div className="text-sm text-green-700 font-medium">
                            Extra Monthly Revenue
                          </div>
                          <div className="text-xs text-green-600/80">
                            $5k → $22k per month
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600 mb-1">
                            7 Days
                          </div>
                          <div className="text-sm text-green-700 font-medium">
                            To See Results
                          </div>
                          <div className="text-xs text-green-600/80">
                            +30% in first week
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 text-center">
                        <div className="text-sm font-semibold text-green-800">
                          💰 That&apos;s an extra{" "}
                          <span className="text-green-600">$204,000</span> per
                          year!
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Numbers */}
      <section className="relative z-10 py-16 px-6 bg-gradient-to-r from-gray-50/50 to-indigo-50/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              {
                number: "50K+",
                label: "Active Users",
                subtext: "Marketers worldwide",
              },
              {
                number: "2M+",
                label: "Templates Created",
                subtext: "And counting",
              },
              {
                number: "98%",
                label: "Satisfaction Rate",
                subtext: "Customer approval",
              },
              {
                number: "30s",
                label: "Average Time",
                subtext: "From URL to template",
              },
            ].map((stat, index) => (
              <div key={index} className="space-y-2 group">
                <div className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
                  {stat.number}
                </div>
                <div className="font-semibold text-gray-900">{stat.label}</div>
                <div className="text-sm text-gray-500">{stat.subtext}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Magic Demo Section */}
      <section
        id="demo"
        className="relative z-10 py-24 px-6 bg-gradient-to-b from-gray-50 to-white"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-gray-900">
              ✨{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                See the Magic
              </span>{" "}
              in Action
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Watch how TemplAIto transforms any product URL into a stunning
              email template in seconds
            </p>
          </div>

          {/* Interactive Wizard Demo */}
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              {/* Left Side - Interactive Steps */}
              <div className="space-y-8">
                {/* Step 1: URL Input with Live Typing Animation */}
                <div
                  className={`bg-white rounded-2xl p-8 shadow-lg border-2 transition-all duration-500 ${
                    wizardStep === 0
                      ? "border-blue-400 shadow-blue-100"
                      : "border-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div
                      className={`w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center transition-all duration-300 ${
                        wizardStep === 0 ? "animate-pulse" : ""
                      }`}
                    >
                      <span className="text-white font-bold text-lg">1</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        Paste Your Product URL
                      </h3>
                      <p className="text-gray-600">Any product page works!</p>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={typedUrl}
                      placeholder="https://..."
                      className={`w-full px-4 py-4 bg-gray-50 border-2 rounded-xl font-mono text-sm transition-all duration-300 ${
                        wizardStep === 0
                          ? "border-blue-400 shadow-lg"
                          : "border-gray-200"
                      }`}
                      readOnly
                    />
                    {wizardStep === 0 && (
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                        <div className="w-0.5 h-5 bg-blue-600 animate-pulse"></div>
                      </div>
                    )}
                    {wizardStep === 1 && (
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                        <div className="flex items-center gap-2 text-blue-600 bg-white px-2 py-1 rounded-lg border border-blue-200 shadow-sm">
                          <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                          <span className="text-sm font-medium">
                            Analyzing...
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {wizardStep >= 2 && (
                    <div className="mt-4 flex items-center gap-2 text-green-600 animate-fade-in">
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">
                        Product detected: Ultimate Water Gun
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 2: Template Selection */}
                <div
                  className={`bg-white rounded-2xl p-8 shadow-lg border-2 transition-all duration-500 ${
                    wizardStep === 2
                      ? "border-purple-400 shadow-purple-100"
                      : "border-gray-100"
                  } ${wizardStep < 2 ? "opacity-60" : "opacity-100"}`}
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div
                      className={`w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center transition-all duration-300 ${
                        wizardStep === 2 ? "animate-pulse" : ""
                      }`}
                    >
                      <span className="text-white font-bold text-lg">2</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        Choose Your Style
                      </h3>
                      <p className="text-gray-600">9 professional templates</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { name: "Professional", color: "blue" },
                      { name: "Promotional", color: "red" },
                      { name: "Elegant", color: "purple" },
                    ].map((template, index) => (
                      <button
                        key={index}
                        className={`p-4 rounded-xl border-2 transition-all duration-500 ${
                          selectedTemplate === index
                            ? "border-red-400 bg-red-50 shadow-lg scale-105"
                            : "border-gray-200"
                        } ${wizardStep < 2 ? "cursor-not-allowed" : ""}`}
                      >
                        <div
                          className={`w-full h-12 bg-gradient-to-r ${
                            template.color === "blue"
                              ? "from-blue-500 to-indigo-600"
                              : template.color === "red"
                              ? "from-red-500 to-pink-600"
                              : "from-purple-500 to-pink-600"
                          } rounded-lg mb-2 transition-all duration-300 ${
                            selectedTemplate === index ? "shadow-md" : ""
                          }`}
                        ></div>
                        <div className="text-xs font-medium text-gray-700">
                          {template.name}
                        </div>
                        {selectedTemplate === index && (
                          <div className="mt-1 animate-bounce">
                            <div className="w-4 h-4 bg-red-500 rounded-full mx-auto flex items-center justify-center">
                              <CheckIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {wizardStep >= 3 && selectedTemplate >= 0 && (
                    <div className="mt-4 flex items-center gap-2 text-green-600 animate-fade-in">
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">
                        Promotional template selected
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 3: Generation Status */}
                <div
                  className={`bg-white rounded-2xl p-8 shadow-lg border-2 transition-all duration-500 ${
                    wizardStep === 3 || wizardStep === 4
                      ? "border-green-400 shadow-green-100"
                      : "border-gray-100"
                  } ${wizardStep < 3 ? "opacity-60" : "opacity-100"}`}
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div
                      className={`w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center transition-all duration-300 ${
                        wizardStep === 3
                          ? "animate-pulse"
                          : wizardStep === 4
                          ? "animate-bounce"
                          : ""
                      }`}
                    >
                      <span className="text-white font-bold text-lg">3</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {wizardStep === 4
                          ? "🎉 Template Ready!"
                          : "AI is Working"}
                      </h3>
                      <p className="text-gray-600">
                        {wizardStep === 4
                          ? "Your email template is complete!"
                          : "Creating your template..."}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div
                      className={`flex items-center gap-3 transition-all duration-500 ${
                        wizardStep >= 3 ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm">
                        Product information extracted
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-3 transition-all duration-500 delay-500 ${
                        wizardStep >= 3 ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm">Compelling copy generated</span>
                    </div>
                    <div
                      className={`flex items-center gap-3 transition-all duration-500 delay-1000 ${
                        wizardStep >= 3 ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      <CheckIcon className="w-5 h-5" />
                      <span className="text-sm">Beautiful design created</span>
                    </div>
                    <div
                      className={`flex items-center gap-3 transition-all duration-500 delay-1500 ${
                        wizardStep === 4
                          ? "text-green-600"
                          : wizardStep === 3
                          ? "text-blue-600"
                          : "text-gray-400"
                      }`}
                    >
                      {wizardStep === 4 ? (
                        <CheckIcon className="w-5 h-5" />
                      ) : wizardStep === 3 ? (
                        <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-400 rounded-full"></div>
                      )}
                      <span className="text-sm font-medium">
                        {wizardStep === 4
                          ? "Template finalized!"
                          : "Finalizing template..."}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Live Email Preview */}
              <div className="lg:sticky lg:top-8">
                <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-900">
                      ✨ Generated Email Template
                    </h3>
                    <div
                      className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all duration-300 ${
                        wizardStep === 4
                          ? "bg-green-100"
                          : wizardStep >= 1
                          ? "bg-blue-100"
                          : "bg-gray-100"
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                          wizardStep === 4
                            ? "bg-green-500 animate-pulse"
                            : wizardStep >= 1
                            ? "bg-blue-500 animate-spin"
                            : "bg-gray-400"
                        }`}
                      ></div>
                      <span
                        className={`text-sm font-semibold transition-colors duration-300 ${
                          wizardStep === 4
                            ? "text-green-700"
                            : wizardStep >= 1
                            ? "text-blue-700"
                            : "text-gray-600"
                        }`}
                      >
                        {wizardStep === 4
                          ? countdown > 0
                            ? `Ready! (${countdown}s)`
                            : "Ready!"
                          : wizardStep >= 1
                          ? "Generating..."
                          : "Waiting"}
                      </span>
                    </div>
                  </div>

                  {/* Email Template Preview - Conditional Display */}
                  <div className="bg-gray-100 rounded-xl p-2 h-[600px] overflow-hidden relative">
                    {/* Loading States (Steps 0-3) */}
                    {wizardStep < 4 && (
                      <div className="bg-white h-full rounded-lg shadow-inner flex items-center justify-center">
                        <div className="text-center p-8">
                          {wizardStep === 0 && (
                            <div className="text-gray-400">
                              <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">📧</span>
                              </div>
                              <p className="text-sm">Waiting for URL...</p>
                            </div>
                          )}

                          {wizardStep === 1 && (
                            <div className="text-blue-600">
                              <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-lg flex items-center justify-center">
                                <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                              </div>
                              <p className="text-sm font-medium">
                                Analyzing product...
                              </p>
                            </div>
                          )}

                          {wizardStep === 2 && (
                            <div className="text-purple-600">
                              <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">🎨</span>
                              </div>
                              <p className="text-sm font-medium">
                                Template selected!
                              </p>
                            </div>
                          )}

                          {wizardStep === 3 && (
                            <div className="text-green-600">
                              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-lg flex items-center justify-center">
                                <div className="relative">
                                  <div className="animate-spin w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full"></div>
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs">AI</span>
                                  </div>
                                </div>
                              </div>
                              <p className="text-sm font-medium">
                                Creating your template...
                              </p>
                              <div className="mt-4 space-y-2">
                                <div className="flex items-center gap-2 text-xs text-green-600">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span>Extracting product info</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-green-600">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span>Writing compelling copy</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-blue-600">
                                  <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <span>Designing beautiful layout</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Progress indicator for restart countdown */}
                    {wizardStep === 4 && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <div className="text-center mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Countdown: {countdown} | Progress:{" "}
                            {restartProgress.toFixed(1)}%
                          </span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full transition-all duration-1000 ease-linear"
                            style={{ width: `${restartProgress}%` }}
                          ></div>
                        </div>
                        <div className="text-center mt-2">
                          <span className="text-xs text-gray-500">
                            {countdown > 3
                              ? "Take your time to review the template"
                              : countdown > 0
                              ? `New demo starting in ${countdown}...`
                              : "Restarting..."}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Actual Template (Step 4 - with magical reveal) */}
                    {wizardStep === 4 && (
                      <div
                        className="bg-white h-full overflow-y-auto rounded-lg shadow-inner animate-fade-in"
                        style={{ fontSize: "8px", lineHeight: "1.2" }}
                      >
                        <div
                          style={{
                            transform: "scale(0.5)",
                            transformOrigin: "top left",
                            width: "200%",
                            height: "200%",
                          }}
                        >
                          {/* Header */}
                          <div
                            style={{
                              background:
                                "linear-gradient(135deg, #007bff 0%, #0056b3 100%)",
                              color: "#ffffff",
                              textAlign: "center",
                              padding: "25px 20px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: "600",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                                marginBottom: "10px",
                              }}
                            >
                              ⏰ LIMITED TIME OFFER
                            </div>
                            <div
                              style={{
                                fontSize: "32px",
                                fontWeight: "bold",
                                marginBottom: "5px",
                              }}
                            >
                              $29.99
                            </div>
                            <div
                              style={{
                                fontSize: "18px",
                                textDecoration: "line-through",
                                opacity: "0.8",
                                marginBottom: "8px",
                              }}
                            >
                              $49.99
                            </div>
                            <div
                              style={{
                                backgroundColor: "#ff4444",
                                color: "#ffffff",
                                padding: "8px 16px",
                                borderRadius: "20px",
                                display: "inline-block",
                                fontSize: "14px",
                                fontWeight: "600",
                              }}
                            >
                              40% OFF
                            </div>
                          </div>

                          {/* Main Content */}
                          <div
                            style={{
                              padding: "40px 30px",
                              textAlign: "center",
                            }}
                          >
                            <h1
                              style={{
                                margin: "0 0 20px 0",
                                fontSize: "28px",
                                fontWeight: "bold",
                                color: "#2c3e50",
                                lineHeight: "1.2",
                              }}
                            >
                              Don&apos;t Miss Out - Ultimate Water Gun on SALE!
                            </h1>

                            <img
                              src="https://coolmango.si/wp-content/uploads/2023/07/prikazna-1.jpg"
                              alt="Ultimate Water Gun"
                              style={{
                                width: "100%",
                                maxWidth: "400px",
                                height: "auto",
                                borderRadius: "8px",
                                margin: "20px auto",
                                display: "block",
                              }}
                            />

                            <div style={{ margin: "30px 0" }}>
                              <div
                                style={{
                                  fontSize: "36px",
                                  fontWeight: "bold",
                                  color: "#007bff",
                                  marginBottom: "5px",
                                }}
                              >
                                $29.99
                              </div>
                              <div
                                style={{
                                  fontSize: "20px",
                                  color: "#6c757d",
                                  textDecoration: "line-through",
                                }}
                              >
                                $49.99
                              </div>
                            </div>

                            <a
                              href="#"
                              style={{
                                display: "inline-block",
                                background:
                                  "linear-gradient(135deg, #007bff 0%, #0056b3 100%)",
                                color: "#ffffff",
                                textDecoration: "none",
                                padding: "18px 40px",
                                borderRadius: "50px",
                                fontSize: "18px",
                                fontWeight: "600",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                              }}
                            >
                              Get 40% OFF Now!
                            </a>
                          </div>

                          {/* Benefits */}
                          <div
                            style={{
                              backgroundColor: "#f8f9fa",
                              padding: "40px 30px",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                marginBottom: "30px",
                                display: "flex",
                                justifyContent: "center",
                                gap: "20px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  backgroundColor: "#28a745",
                                  color: "#ffffff",
                                  padding: "12px 20px",
                                  borderRadius: "25px",
                                  fontSize: "14px",
                                  fontWeight: "600",
                                }}
                              >
                                🚚 FREE SHIPPING
                              </span>
                              <span
                                style={{
                                  backgroundColor: "#17a2b8",
                                  color: "#ffffff",
                                  padding: "12px 20px",
                                  borderRadius: "25px",
                                  fontSize: "14px",
                                  fontWeight: "600",
                                }}
                              >
                                ⚡ FAST DELIVERY
                              </span>
                              <span
                                style={{
                                  backgroundColor: "#ffc107",
                                  color: "#000000",
                                  padding: "12px 20px",
                                  borderRadius: "25px",
                                  fontSize: "14px",
                                  fontWeight: "600",
                                }}
                              >
                                ✅ WARRANTY
                              </span>
                            </div>

                            <h2
                              style={{
                                margin: "0 0 25px 0",
                                fontSize: "24px",
                                fontWeight: "bold",
                                color: "#2c3e50",
                              }}
                            >
                              Why Choose Ultimate Water Gun?
                            </h2>

                            <div
                              style={{
                                textAlign: "left",
                                maxWidth: "500px",
                                margin: "0 auto",
                              }}
                            >
                              <div
                                style={{
                                  padding: "12px 0",
                                  fontSize: "16px",
                                  color: "#495057",
                                  borderBottom: "1px solid #e9ecef",
                                }}
                              >
                                <strong>💧 Perfect for Water Battles</strong> -
                                Maximum fun for the whole family
                              </div>
                              <div
                                style={{
                                  padding: "12px 0",
                                  fontSize: "16px",
                                  color: "#495057",
                                  borderBottom: "1px solid #e9ecef",
                                }}
                              >
                                <strong>🎯 Perfect Control</strong> - Precise
                                targeting and easy handling
                              </div>
                              <div
                                style={{
                                  padding: "12px 0",
                                  fontSize: "16px",
                                  color: "#495057",
                                  borderBottom: "1px solid #e9ecef",
                                }}
                              >
                                <strong>🔧 Adjustable Stream</strong> -
                                Customizable options for different game modes
                              </div>
                              <div
                                style={{
                                  padding: "12px 0",
                                  fontSize: "16px",
                                  color: "#495057",
                                }}
                              >
                                <strong>🚀 Impressive Range</strong> -
                                Long-distance reach for tactical advantage
                              </div>
                            </div>

                            <div
                              style={{
                                backgroundColor: "#fff3cd",
                                border: "2px solid #ffeaa7",
                                borderRadius: "8px",
                                padding: "20px",
                                margin: "25px 0",
                                color: "#856404",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "18px",
                                  fontWeight: "bold",
                                  marginBottom: "10px",
                                }}
                              >
                                ⚠️ WARNING: Sale Ends Soon!
                              </div>
                              <div style={{ fontSize: "16px" }}>
                                Don&apos;t wait - limited time offer!
                              </div>
                            </div>
                          </div>

                          {/* Footer CTA */}
                          <div
                            style={{
                              padding: "30px",
                              textAlign: "center",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            <a
                              href="#"
                              style={{
                                display: "inline-block",
                                background:
                                  "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
                                color: "#ffffff",
                                textDecoration: "none",
                                padding: "20px 50px",
                                borderRadius: "50px",
                                fontSize: "20px",
                                fontWeight: "600",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                              }}
                            >
                              ORDER NOW - SAVE 40%
                            </a>

                            <div
                              style={{
                                marginTop: "20px",
                                fontSize: "14px",
                                color: "#6c757d",
                              }}
                            >
                              Limited offer • While supplies last • Free
                              shipping
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-24 px-6 bg-gradient-to-r from-gray-50/50 to-indigo-50/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl lg:text-4xl xl:text-5xl font-bold mb-6 text-gray-900">
              Why Choose TemplAIto?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              The most advanced AI email template generator, trusted by
              marketers worldwide
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-12">
            {[
              {
                icon: <BeakerIcon className="w-10 h-10" />,
                title: "Dual AI Power",
                description:
                  "OpenAI creates compelling copy while Claude designs beautiful HTML templates.",
                gradient: "from-blue-500 to-indigo-600",
                features: [
                  "GPT-4 Copywriting",
                  "Claude Design",
                  "Perfect Harmony",
                ],
              },
              {
                icon: <BoltIcon className="w-10 h-10" />,
                title: "Lightning Fast",
                description:
                  "From URL to stunning template in 30 seconds. No more hours wasted on email design.",
                gradient: "from-yellow-500 to-orange-600",
                features: [
                  "30-Second Generation",
                  "Instant Results",
                  "Zero Wait Time",
                ],
              },
              {
                icon: <PaintBrushIcon className="w-10 h-10" />,
                title: "9 Pro Styles",
                description:
                  "From minimal elegance to luxury sophistication. Every template is mobile-responsive.",
                gradient: "from-purple-500 to-pink-600",
                features: [
                  "Professional Design",
                  "Mobile Responsive",
                  "All Email Clients",
                ],
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="group relative bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-4"
              >
                <div
                  className={`w-16 h-16 bg-gradient-to-r ${feature.gradient} rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-lg`}
                >
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold mb-4 text-gray-900">
                  {feature.title}
                </h3>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {feature.description}
                </p>
                <div className="space-y-2">
                  {feature.features.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <CheckIcon className="w-4 h-4 text-green-500" />
                      <span className="text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl lg:text-4xl xl:text-5xl font-bold mb-6 text-gray-900">
              Loved by Marketers
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Join thousands who&apos;ve transformed their email marketing with
              TemplAIto
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {[
              {
                name: "Sarah Chen",
                role: "Marketing Director",
                company: "TechFlow Inc",
                image:
                  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face",
                quote:
                  "TemplAIto transformed our email marketing. We went from spending hours on templates to creating stunning emails in minutes. Our conversion rates increased by 340%.",
                results: "+340% conversions",
              },
              {
                name: "Marcus Rodriguez",
                role: "E-commerce Manager",
                company: "ShopHub",
                image:
                  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
                quote:
                  "The multi-product templates are game-changers. What used to take our design team 3 days now happens in 30 seconds. The ROI is incredible.",
                results: "3 days → 30 seconds",
              },
              {
                name: "Emma Thompson",
                role: "Founder",
                company: "Boutique Plus",
                image:
                  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
                quote:
                  "As a small business owner, TemplAIto gives me professional templates that rival big agencies - without the cost. It's like having a design team in my pocket.",
                results: "90% cost savings",
              },
            ].map((testimonial, index) => (
              <div
                key={index}
                className="bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2"
              >
                <div className="flex items-center gap-4 mb-6">
                  <Image
                    src={testimonial.image}
                    alt={testimonial.name}
                    width={60}
                    height={60}
                    className="rounded-full object-cover shadow-md"
                  />
                  <div>
                    <h4 className="font-bold text-gray-900">
                      {testimonial.name}
                    </h4>
                    <p className="text-gray-600">{testimonial.role}</p>
                    <p className="text-indigo-600 text-sm font-semibold">
                      {testimonial.company}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="w-4 h-4 text-yellow-400" />
                  ))}
                </div>

                <p className="text-gray-700 leading-relaxed mb-4 italic">
                  {testimonial.quote}
                </p>

                <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-green-100 to-emerald-100 border border-green-200 rounded-full">
                  <ArrowTrendingUpIcon className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">
                    {testimonial.results}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200/50 rounded-3xl p-16 shadow-2xl">
            <h2 className="text-3xl lg:text-4xl xl:text-5xl font-bold mb-6 text-gray-900">
              Ready to Transform Your
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Email Marketing?
              </span>
            </h2>
            <p className="text-xl text-gray-600 mb-12 leading-relaxed">
              Join 50,000+ marketers who&apos;ve already discovered the power of
              AI-generated email templates. Start your free journey today.
            </p>

            <div className="space-y-6">
              <button
                onClick={handleGetStarted}
                className="px-10 cursor-pointer py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-bold text-xl shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105"
              >
                <span className="flex items-center justify-center gap-3">
                  <SparklesIcon className="w-6 h-6" />
                  Start Creating for Free
                  <ArrowRightIcon className="w-5 h-5" />
                </span>
              </button>

              <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  Unlimited templates
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  All 9 styles included
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-6 border-t border-gray-200/50 bg-gradient-to-r from-gray-50/50 to-indigo-50/30">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              TemplAIto
            </span>
          </div>

          <div className="flex items-center gap-8 text-gray-500">
            <span>© 2025 TemplAIto. All rights reserved.</span>
            <div className="flex items-center gap-6 text-sm">
              <span className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-green-500" />
                GDPR Compliant
              </span>
              <span className="flex items-center gap-2">
                <UserGroupIcon className="w-4 h-4 text-blue-500" />
                50K+ Users
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* CSS Animations */}
      <style jsx>{`
        .animation-delay-0 {
          animation-delay: 0s;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animation-delay-1000 {
          animation-delay: 1s;
        }
        .animation-delay-3000 {
          animation-delay: 3s;
        }

        @keyframes dash {
          to {
            stroke-dashoffset: -10;
          }
        }

        @keyframes pointPop {
          0% {
            transform: scale(0) translateY(10px);
            opacity: 0;
          }
          60% {
            transform: scale(1.2) translateY(-5px);
            opacity: 0.9;
          }
          100% {
            transform: scale(1) translateY(0px);
            opacity: 1;
          }
        }

        @keyframes chartRise {
          0% {
            transform: translateY(20px) scaleY(0.8);
            opacity: 0;
          }
          100% {
            transform: translateY(0px) scaleY(1);
            opacity: 1;
          }
        }

        @keyframes glowPulse {
          0%,
          100% {
            filter: drop-shadow(0 0 5px rgba(16, 185, 129, 0.3));
          }
          50% {
            filter: drop-shadow(0 0 20px rgba(16, 185, 129, 0.6));
          }
        }

        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(30px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fadeInUp 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
