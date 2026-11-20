import Link from "next/link";
import { RegisterForm } from "../auth-forms";

export const metadata = { title: "Create your account" };

export default function Register() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Start your free trial</h1>
        <p className="text-sm text-muted-foreground">7 days of full access. No card required, no automatic charges.</p>
      </div>
      <RegisterForm />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-primary">Sign in</Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        By creating an account you agree to the Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
