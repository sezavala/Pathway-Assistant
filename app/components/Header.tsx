import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-gray-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          {/* Placeholder logo: a rounded square until we have a real one. */}
          <span className="h-6 w-6 rounded-md bg-gray-900" aria-hidden="true" />
          Pathway
        </Link>

        <nav className="flex items-center gap-6 text-sm text-gray-600">
          <Link href="#" className="hover:text-gray-900">
            About
          </Link>
          {/* TODO: decide what "Request demo" does (mailto link, form, etc.). */}
          <Link href="#" className="hover:text-gray-900">
            Request demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
