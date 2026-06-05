"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  GlobeAltIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClientDetail } from "./types";

interface ClientHeaderProps {
  client: ClientDetail;
  isActive: boolean;
  savingActive: boolean;
  deleting: boolean;
  onSetActive: () => void;
  onDelete: () => void;
}

export function ClientHeader({
  client,
  isActive,
  savingActive,
  deleting,
  onSetActive,
  onDelete,
}: ClientHeaderProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <Link
            href="/clients"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-brand-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to clients
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {client.name}
            </h1>
            {isActive && (
              <Badge variant="brand" dot>
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Active client
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {client.industry && (
              <span className="font-medium text-brand-600">
                {client.industry}
              </span>
            )}
            {client.website && (
              <a
                href={client.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-ink"
              >
                <GlobeAltIcon className="h-4 w-4" />
                {client.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2.5">
          {!isActive && (
            <Button onClick={onSetActive} isLoading={savingActive}>
              Set as active
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onDelete}
            isLoading={deleting}
            leftIcon={<TrashIcon className="h-4 w-4" />}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
