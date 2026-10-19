import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { SignInWithGoogle } from "./components/SignInWithGoogle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Hero />
        <div className="mt-10">
          <SignInWithGoogle />
        </div>
      </main>
    </div>
  );
}
