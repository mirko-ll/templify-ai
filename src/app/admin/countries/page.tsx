"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PlusIcon } from "@heroicons/react/24/outline";
import { InlineLoadingSpinner } from "@/components/ui/loading-spinner";

interface Country {
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCountriesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCountries = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/countries");
      if (!response.ok) {
        throw new Error("Failed to load countries");
      }
      const data = (await response.json()) as { countries: Country[] };
      setCountries(Array.isArray(data.countries) ? data.countries : []);
    } catch (err) {
      console.error(err);
      setError("Unable to load countries. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCountries();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!formCode.trim() || !formName.trim()) {
      setFormError("Country code and name are required");
      return;
    }

    setFormSubmitting(true);
    try {
      const response = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to save country");
      }

      setFormCode("");
      setFormName("");
      await loadCountries();
    } catch (err) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : "Unable to save country");
    } finally {
      setFormSubmitting(false);
    }
  };

  const toggleCountry = async (country: Country) => {
    try {
      const response = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: country.code,
          name: country.name,
          isActive: !country.isActive,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update country");
      }

      await loadCountries();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to update country");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link
              href="/admin/prompts"
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Back to admin
            </Link>
            <span>/</span>
            <span>Countries</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Countries</h1>
          <p className="text-gray-600 mt-1">
            Manage the list of supported countries that clients can activate.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-900">Add or update country</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Country code (ISO 2-letter)
            </label>
            <input
              type="text"
              value={formCode}
              maxLength={2}
              onChange={(event) => setFormCode(event.target.value.toUpperCase())}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="e.g. US"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Country name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="United States"
            />
          </div>
        </div>

        {formError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={formSubmitting}
          className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-white font-semibold shadow-lg hover:shadow-xl disabled:opacity-60"
        >
          <PlusIcon className="w-4 h-4" /> {formSubmitting ? "Saving..." : "Save country"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
          <InlineLoadingSpinner text="Loading countries..." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-700">
              {countries.map((country) => (
                <tr key={country.code}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{country.code}</td>
                  <td className="px-4 py-3">{country.name}</td>
                  <td className="px-4 py-3">
                    {country.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleCountry(country)}
                      className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {country.isActive ? "Disable" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
