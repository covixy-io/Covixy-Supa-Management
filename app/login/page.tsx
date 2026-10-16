import { loginAction } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-muted text-xs font-semibold tracking-wide">COVIXY</p>
          <h1 className="text-3xl font-bold">Supa</h1>
          <p className="text-muted mt-2 text-sm">One self-hosted Supabase stack per project, on Coolify.</p>
        </div>
        <ThemeToggle />
      </div>
      <form action={loginAction} className="card p-6">
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input name="password" type="password" required autoFocus className="mt-2 w-full px-3 py-3" />
        </label>
        {params.error ? <p className="text-danger mt-3 text-sm">Wrong password.</p> : null}
        <button type="submit" className="btn btn-primary mt-6">
          Enter
        </button>
      </form>
    </main>
  );
}
