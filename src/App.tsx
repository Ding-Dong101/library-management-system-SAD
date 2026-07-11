import React, { useState, useEffect } from 'react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { Member, Staff } from './types.ts';
import MemberDashboard from './components/MemberDashboard.tsx';
import LibrarianWorkspace from './components/LibrarianWorkspace.tsx';
import { Library, User, Lock, AlertTriangle, LogOut } from 'lucide-react';

export default function App() {
  const [memberProfile, setMemberProfile] = useState<(Member & { activeLoanCount: number; unpaidFineAmount: number }) | null>(null);
  const [staffProfile, setStaffProfile] = useState<Staff | null>(null);
  const [authMode, setAuthMode] = useState<'guest' | 'member' | 'staff'>('guest');

  // Staff login state
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffError, setStaffError] = useState<string | null>(null);

  // General loading states
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Recover Staff Session from sessionStorage if available
    const savedStaff = sessionStorage.getItem('staff_session');
    if (savedStaff) {
      try {
        const parsed = JSON.parse(savedStaff);
        setStaffProfile(parsed);
        setAuthMode('staff');
      } catch (e) {
        sessionStorage.removeItem('staff_session');
      }
    }

    // 2. Listen for Firebase Auth changes for Members
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLoading(true);
        try {
          const idToken = await firebaseUser.getIdToken();
          // Sync with database
          const res = await fetch('/api/auth/sync-member', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            setMemberProfile(data);
            setAuthMode('member');
          } else {
            console.error('Failed to sync member profile');
            await fbSignOut(auth);
          }
        } catch (err) {
          console.error(err);
          await fbSignOut(auth);
        } finally {
          setLoading(false);
        }
      } else {
        setMemberProfile(null);
        if (authMode === 'member') {
          setAuthMode('guest');
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleMemberLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      console.error('Google login error:', err);
      setLoading(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: staffEmail, password: staffPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStaffProfile(data);
        sessionStorage.setItem('staff_session', JSON.stringify(data));
        setAuthMode('staff');
        setStaffEmail('');
        setStaffPassword('');
      } else {
        setStaffError(data.error || 'Login failed');
      }
    } catch (err: any) {
      setStaffError(err.message);
    }
  };

  const handleMemberLogout = async () => {
    setLoading(true);
    await fbSignOut(auth);
    setMemberProfile(null);
    setAuthMode('guest');
    setLoading(false);
  };

  const handleStaffLogout = () => {
    setStaffProfile(null);
    sessionStorage.removeItem('staff_session');
    setAuthMode('guest');
  };

  const handleRefreshMemberProfile = async () => {
    if (!auth.currentUser || !memberProfile) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/members/${memberProfile.id}`);
      if (res.ok) {
        const data = await res.json();
        setMemberProfile(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-bg-geo font-sans text-text-geo flex flex-col selection:bg-highlight-geo">
      
      {/* Spacious Navbar */}
      <header className="border-b border-text-geo/10 py-8 px-10 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-text-geo text-white rounded-none flex items-center justify-center">
            <Library className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-geo">Lexend</h1>
            <p className="text-xs text-muted-geo font-medium tracking-[0.2em] uppercase">Library System</p>
          </div>
        </div>

        {/* Global logout or portal status indicators */}
        <div className="flex items-center gap-6">
          {authMode === 'member' && memberProfile && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-geo">
                Member Mode: <strong className="text-text-geo">{memberProfile.firstName} {memberProfile.lastName}</strong>
              </span>
              <button
                onClick={handleMemberLogout}
                className="p-2 hover:bg-highlight-geo text-muted-geo hover:text-text-geo rounded-none transition-all"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}

          {authMode === 'staff' && staffProfile && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-geo">
                Staff Mode: <strong className="text-text-geo">{staffProfile.firstName} {staffProfile.lastName}</strong>
              </span>
              <button
                onClick={handleStaffLogout}
                className="p-2 hover:bg-highlight-geo text-muted-geo hover:text-text-geo rounded-none transition-all"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}

          {authMode === 'guest' && (
            <span className="text-xs font-semibold tracking-[0.25em] text-muted-geo uppercase">
              Secure Gateway Access
            </span>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 text-muted-geo font-medium tracking-wide">
            Authenticating credentials...
          </div>
        ) : (
          <>
            {/* GUEST ACCESS SELECTOR */}
            {authMode === 'guest' && (
              <div className="flex-1 flex flex-col items-center justify-center p-10 max-w-5xl mx-auto w-full gap-16 py-20">
                
                {/* Heading */}
                <div className="text-center space-y-4 max-w-2xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-geo">Welcome to Athenaeum</div>
                  <h2 className="text-5xl font-semibold tracking-tight text-text-geo leading-tight">
                    Universal Library Operations Portal
                  </h2>
                  <p className="text-lg text-muted-geo font-light leading-relaxed">
                    Select your access gateway below to search materials, renew books, manage physical branches, and track circulation.
                  </p>
                </div>

                {/* Gateway Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full">
                  
                  {/* Member Login Card */}
                  <div className="bg-white p-12 rounded-none flex flex-col justify-between items-start gap-10 hover:bg-highlight-geo/20 transition-all border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                    <div className="space-y-4">
                      <div className="p-4 bg-text-geo/5 text-text-geo rounded-none w-fit">
                        <User className="w-8 h-8" />
                      </div>
                      <h3 className="text-3xl font-semibold text-text-geo tracking-tight">Member Hub</h3>
                      <p className="text-muted-geo leading-relaxed font-light text-sm">
                        Log in using your official email account to search the digital book repository, track active loans, reserve hold titles, and clear overdue fines.
                      </p>
                    </div>

                    <button
                      onClick={handleMemberLogin}
                      className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none transition-all shadow-sm flex items-center justify-center gap-3 cursor-pointer"
                    >
                      <span>Sign In with Google</span>
                    </button>
                  </div>

                  {/* Librarian Login Card */}
                  <div className="bg-white p-12 rounded-none space-y-8 hover:bg-highlight-geo/20 transition-all border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                    <div className="space-y-4">
                      <div className="p-4 bg-text-geo/5 text-text-geo rounded-none w-fit">
                        <Lock className="w-8 h-8" />
                      </div>
                      <h3 className="text-3xl font-semibold text-text-geo tracking-tight">Librarian Workspace</h3>
                      <p className="text-muted-geo leading-relaxed font-light text-sm">
                        Authorized staff portal to register physical inventory copies, transfer books across branches, waive outstanding fines, and compile metrics.
                      </p>
                    </div>

                    <form onSubmit={handleStaffLogin} className="space-y-4">
                      {staffError && (
                        <div className="p-4 bg-rose-50 text-rose-800 rounded-none flex items-center gap-2 text-sm border-l-2 border-rose-600">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>{staffError}</span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <input
                          type="email"
                          required
                          placeholder="Staff Email"
                          value={staffEmail}
                          onChange={(e) => setStaffEmail(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3.5 rounded-none text-text-geo border border-text-geo/10 placeholder-muted-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm font-sans"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <input
                          type="password"
                          required
                          placeholder="Password"
                          value={staffPassword}
                          onChange={(e) => setStaffPassword(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3.5 rounded-none text-text-geo border border-text-geo/10 placeholder-muted-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm font-sans"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none transition-all shadow-sm cursor-pointer"
                      >
                        Enter Staff Portal
                      </button>
                    </form>

                    <div className="text-center">
                      <p className="text-xs text-muted-geo">
                        Default Demo Access: <strong className="text-text-geo">staff@library.com</strong> / <strong className="text-text-geo">password123</strong>
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* MEMBER HUB VIEW */}
            {authMode === 'member' && memberProfile && (
              <MemberDashboard
                memberProfile={memberProfile}
                onRefreshProfile={handleRefreshMemberProfile}
              />
            )}

            {/* LIBRARIAN WORKSPACE VIEW */}
            {authMode === 'staff' && staffProfile && (
              <LibrarianWorkspace
                staffMember={staffProfile}
                onLogout={handleStaffLogout}
              />
            )}
          </>
        )}
      </main>

      {/* Spacious Footer */}
      <footer className="border-t border-text-geo/10 py-12 px-10 text-center text-xs text-muted-geo font-light mt-16">
        <p>© 2026 Lexend Library Management System. Crafted with geometric balance and borderless simplicity.</p>
      </footer>
    </div>
  );
}
