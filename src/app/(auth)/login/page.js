'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const type = searchParams.get('type') || 'member';
  const isAdmin = type === 'admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  setLoading(true);
  setError('');

  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    setError('Invalid email or password.');
    setLoading(false);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const role = profile?.role || 'member';
  const isStaffRole = role === 'admin' || role === 'pastor' || role === 'leader';

  // Block wrong portal access
  if (isAdmin && !isStaffRole) {
    await supabase.auth.signOut();
    setError('This account does not have staff access. Please use Member Login instead.');
    setLoading(false);
    return;
  }

  if (!isAdmin && isStaffRole) {
    await supabase.auth.signOut();
    setError('Staff accounts must use Staff Login instead.');
    setLoading(false);
    return;
  }

  // Redirect based on role
  if (isStaffRole) {
    router.push('/dashboard');
  } else {
    router.push('/member-dashboard');
  }
};
  return (
    <div className="min-h-screen bg-[#0f111a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1a1d2e] rounded-3xl p-8 border border-white/10">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⛪</div>
          <h1 className="text-2xl font-black text-white">
            {isAdmin ? 'Staff Login' : 'Member Login'}
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {isAdmin ? 'Access the full FaithSync dashboard' : 'View your church community'}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-white/70 text-sm font-semibold block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm font-semibold block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-2">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <p className="text-center text-white/30 text-sm mt-6">
          <a href="/" className="hover:text-white/60 transition">← Back to Home</a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}