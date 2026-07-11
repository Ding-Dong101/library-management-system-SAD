import React, { useState, useEffect } from 'react';
import { Book, Member, Loan, Fine, Reservation, Branch } from '../types.ts';
import { Search, BookOpen, Clock, AlertTriangle, Check, RefreshCw, Bookmark } from 'lucide-react';

interface MemberDashboardProps {
  memberProfile: Member & { activeLoanCount: number; unpaidFineAmount: number };
  onRefreshProfile: () => void;
}

export default function MemberDashboard({ memberProfile, onRefreshProfile }: MemberDashboardProps) {
  // Catalog search
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [loadingBooks, setLoadingBooks] = useState(false);

  // Member lists
  const [loans, setLoans] = useState<Loan[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Status messages
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchBranches();
    fetchMemberData();
    searchCatalog('');
  }, [memberProfile.id]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      if (Array.isArray(data)) {
        setBranches(data);
        if (data.length > 0) setSelectedBranchId(data[0].id.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMemberData = async () => {
    setLoadingData(true);
    try {
      // Fetch loans
      const loansRes = await fetch(`/api/members/${memberProfile.id}/loans`);
      const loansData = await loansRes.json();
      if (Array.isArray(loansData)) setLoans(loansData);

      // Fetch fines
      const finesRes = await fetch(`/api/members/${memberProfile.id}/fines`);
      const finesData = await finesRes.json();
      if (Array.isArray(finesData)) setFines(finesData);

      // Fetch reservations
      const resRes = await fetch(`/api/members/${memberProfile.id}/reservations`);
      const resData = await resRes.json();
      if (Array.isArray(resData)) setReservations(resData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const searchCatalog = async (q: string) => {
    setLoadingBooks(true);
    try {
      const res = await fetch(`/api/books?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) setBooks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBooks(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchCatalog(searchQuery);
  };

  const handleRenew = async (loanId: number) => {
    try {
      const res = await fetch(`/api/loans/${loanId}/renew`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: 'Book loan extended successfully!', type: 'success' });
        fetchMemberData();
        onRefreshProfile();
      } else {
        setMessage({ text: data.error || 'Failed to renew loan', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handlePayFine = async (fineId: number) => {
    try {
      const res = await fetch(`/api/fines/${fineId}/pay`, {
        method: 'PUT',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: 'Fine payment processed successfully!', type: 'success' });
        fetchMemberData();
        onRefreshProfile();
      } else {
        setMessage({ text: data.error || 'Failed to pay fine', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleReserve = async (bookId: number) => {
    if (!selectedBranchId) {
      setMessage({ text: 'Please select a pickup branch', type: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          memberId: memberProfile.id,
          branchId: parseInt(selectedBranchId, 10),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: `Reservation placed successfully! Keep-hold until ${new Date(data.expirationDate).toLocaleDateString()}`, type: 'success' });
        fetchMemberData();
      } else {
        setMessage({ text: data.error || 'Failed to place reservation', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-16 p-10 max-w-7xl mx-auto selection:bg-highlight-geo">
      {/* Toast Notification */}
      {message && (
        <div className={`p-6 rounded-none flex items-center justify-between transition-all border ${
          message.type === 'success' ? 'bg-[#E2F5E9] text-[#2D6A4F] border-[#2D6A4F]/10' : 'bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]/10'
        }`}>
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-sm underline hover:opacity-80 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Spacious Header Profile Card */}
      <div className="bg-white rounded-none p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-10 border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
        <div className="space-y-3">
          <span className="text-xs font-semibold tracking-[0.25em] text-muted-geo uppercase block">Member Profile</span>
          <h2 className="text-4xl font-semibold tracking-tight text-text-geo">
            {memberProfile.firstName} {memberProfile.lastName}
          </h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-geo text-sm">
            <span>Email: <strong className="text-text-geo font-medium">{memberProfile.email}</strong></span>
            <span>•</span>
            <span>Membership: <strong className="text-text-geo capitalize font-medium">{memberProfile.membershipType}</strong></span>
            <span>•</span>
            <span>Member Since: <strong className="text-text-geo font-medium">{new Date(memberProfile.membershipDate).toLocaleDateString()}</strong></span>
          </div>
        </div>

        {/* Dynamic Aggregated Stats */}
        <div className="flex gap-12">
          <div className="space-y-1">
            <span className="text-xs text-muted-geo uppercase tracking-widest block font-medium">Active Loans</span>
            <span className="text-5xl font-semibold text-text-geo block">
              {memberProfile.activeLoanCount}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-geo uppercase tracking-widest block font-medium">Unpaid Fines</span>
            <span className={`text-5xl font-semibold block ${memberProfile.unpaidFineAmount > 0 ? 'text-rose-600' : 'text-text-geo'}`}>
              ${memberProfile.unpaidFineAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        
        {/* Left Side: Catalog Search & Reservations */}
        <div className="lg:col-span-7 space-y-16">
          <div className="space-y-6">
            <h3 className="text-2xl font-semibold tracking-tight text-text-geo">Search Digital Catalog</h3>
            
            <form onSubmit={handleSearchSubmit} className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-geo" />
                <input
                  type="text"
                  placeholder="Search title, authors, categories or ISBN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white pl-12 pr-4 py-4 rounded-none text-text-geo placeholder-muted-geo border border-text-geo/10 focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all font-sans text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-8 py-4 bg-text-geo hover:bg-accent-geo text-white rounded-none font-medium transition-all cursor-pointer"
              >
                Search
              </button>
            </form>

            {/* Branch Selection for holding */}
            <div className="flex items-center gap-4 text-sm text-muted-geo bg-white p-4 rounded-none border border-text-geo/5">
              <span>Preferred holding branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-bg-geo px-3 py-1.5 rounded-none border border-text-geo/10 text-text-geo font-medium focus:outline-none focus:ring-1 focus:ring-accent-geo"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Book Catalog Results */}
            <div className="space-y-6">
              {loadingBooks ? (
                <div className="text-muted-geo text-center py-10">Searching library shelves...</div>
              ) : books.length === 0 ? (
                <div className="text-muted-geo py-10 bg-white rounded-none text-center border border-text-geo/5">No titles found. Try adjusting your terms.</div>
              ) : (
                <div className="space-y-6">
                  {books.map((book) => (
                    <div key={book.id} className="p-8 hover:bg-highlight-geo/10 transition-all rounded-none bg-white border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 bg-highlight-geo text-[11px] font-semibold text-text-geo rounded-none border border-text-geo/10">
                            {book.isbn}
                          </span>
                          <span className="text-xs text-muted-geo">
                            Edition {book.edition || 1} • {book.publicationYear}
                          </span>
                        </div>
                        <h4 className="text-xl font-semibold text-text-geo tracking-tight">{book.title}</h4>
                        <p className="text-muted-geo text-sm">
                          By <strong className="text-text-geo">{book.authors.map(a => `${a.firstName} ${a.lastName}`).join(', ')}</strong>
                        </p>
                        <p className="text-muted-geo text-xs italic line-clamp-2">
                          {book.description || 'No description provided.'}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {book.categories.map(c => (
                            <span key={c.id} className="px-2.5 py-0.5 bg-bg-geo text-muted-geo rounded-none border border-text-geo/5 text-xs font-medium">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Reserve Block */}
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 min-w-[150px]">
                        <div className="text-left md:text-right space-y-1">
                          <span className="text-xs text-muted-geo block">Available Inventory</span>
                          <span className="text-lg font-bold text-text-geo">
                            {book.availableCopies} <span className="text-xs text-muted-geo font-normal">/ {book.totalCopies} copies</span>
                          </span>
                        </div>
                        <button
                          onClick={() => handleReserve(book.id)}
                          className="px-5 py-2.5 bg-bg-geo hover:bg-highlight-geo text-text-geo rounded-none text-sm font-medium transition-all flex items-center gap-2 border border-text-geo/10 cursor-pointer"
                        >
                          <Bookmark className="w-4 h-4" />
                          Reserve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Active Loans, Fines, Reservations */}
        <div className="lg:col-span-5 space-y-16">
          
          {/* Active Loans */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-text-geo/10 pb-4">
              <BookOpen className="w-6 h-6 text-accent-geo" />
              <h3 className="text-2xl font-semibold tracking-tight text-text-geo">Current Books Out</h3>
            </div>

            {loadingData ? (
              <div className="text-muted-geo text-center py-6">Loading lists...</div>
            ) : loans.filter(l => !l.returnDate).length === 0 ? (
              <div className="p-8 bg-white rounded-none border border-text-geo/5 text-muted-geo text-center">
                No active loans. Check out books at any counter.
              </div>
            ) : (
              <div className="space-y-4">
                {loans.filter(l => !l.returnDate).map((l) => {
                  const isOverdue = new Date() > new Date(l.dueDate);
                  return (
                    <div key={l.loanId} className="p-6 bg-white rounded-none border border-text-geo/5 hover:bg-highlight-geo/10 transition-all space-y-4">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-geo uppercase tracking-widest block font-semibold">
                          Due by {new Date(l.dueDate).toLocaleDateString()}
                        </span>
                        <h4 className="font-semibold text-text-geo text-lg leading-snug">{l.bookTitle}</h4>
                        <div className="flex justify-between items-center text-xs text-muted-geo pt-1">
                          <span>Branch: <strong className="text-text-geo font-medium">{l.branchName}</strong></span>
                          <span>Borrowed: {new Date(l.loanDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-text-geo/5">
                        {isOverdue ? (
                          <span className="text-xs text-rose-600 font-semibold flex items-center gap-1.5 bg-[#FEE2E2] px-2 py-0.5 rounded-none border border-rose-600/10">
                            <AlertTriangle className="w-3.5 h-3.5" /> Overdue ($0.50/day fine)
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600 font-semibold bg-[#E2F5E9] px-2 py-0.5 rounded-none border border-emerald-600/10">On Track</span>
                        )}
                        <button
                          onClick={() => handleRenew(l.loanId)}
                          className="px-3.5 py-1.5 bg-bg-geo hover:bg-highlight-geo text-text-geo rounded-none text-xs font-semibold border border-text-geo/10 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" /> Renew
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reserved Holds */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-text-geo/10 pb-4">
              <Bookmark className="w-6 h-6 text-accent-geo" />
              <h3 className="text-2xl font-semibold tracking-tight text-text-geo">Your Reservations</h3>
            </div>

            {reservations.length === 0 ? (
              <div className="p-8 bg-white rounded-none border border-text-geo/5 text-muted-geo text-center">
                No reservations placed.
              </div>
            ) : (
              <div className="space-y-4">
                {reservations.map((r) => (
                  <div key={r.reservationId} className="p-6 bg-white rounded-none border border-text-geo/5 hover:bg-highlight-geo/10 transition-all flex justify-between items-center gap-4">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-text-geo leading-snug">{r.bookTitle}</h4>
                      <p className="text-xs text-muted-geo">
                        Placed on {new Date(r.reservationDate).toLocaleDateString()} • Pickup: <strong className="text-text-geo font-medium">{r.branchName}</strong>
                      </p>
                    </div>
                    <div className="text-right space-y-1 min-w-[90px]">
                      <span className={`px-2 py-1 rounded-none text-[10px] font-bold block text-center uppercase tracking-wider border ${
                        r.status === 'fulfilled' ? 'bg-[#E2F5E9] text-[#2D6A4F] border-[#2D6A4F]/10' :
                        r.status === 'pending' ? 'bg-bg-geo text-muted-geo border-text-geo/10' :
                        'bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]/10'
                      }`}>
                        {r.status}
                      </span>
                      <span className="text-[10px] text-muted-geo block pt-1">
                        Expires {new Date(r.expirationDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding Fines */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-text-geo/10 pb-4">
              <Clock className="w-6 h-6 text-accent-geo" />
              <h3 className="text-2xl font-semibold tracking-tight text-text-geo">Fines Ledger</h3>
            </div>

            {fines.length === 0 ? (
              <div className="p-8 bg-white rounded-none border border-text-geo/5 text-muted-geo text-center">
                Excellent! No overdue fines on record.
              </div>
            ) : (
              <div className="space-y-4">
                {fines.map((f) => (
                  <div key={f.fineId} className="p-6 bg-white rounded-none border border-text-geo/5 hover:bg-highlight-geo/10 transition-all space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-text-geo">{f.bookTitle}</h4>
                        <p className="text-xs text-muted-geo">
                          Due {new Date(f.dueDate).toLocaleDateString()} • Returned {f.returnDate ? new Date(f.returnDate).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <span className={`text-xl font-bold ${f.paidStatus ? 'text-muted-geo line-through' : 'text-rose-600'}`}>
                        ${Number(f.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-text-geo/5">
                      <span className={`text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-none border ${
                        f.paidStatus ? 'bg-[#E2F5E9] text-[#2D6A4F] border-[#2D6A4F]/10' : 'bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]/10'
                      }`}>
                        {f.paidStatus ? 'Paid' : 'Unpaid'}
                      </span>
                      {!f.paidStatus && (
                        <button
                          onClick={() => handlePayFine(f.fineId)}
                          className="px-3.5 py-1.5 bg-text-geo hover:bg-accent-geo text-white rounded-none text-xs font-semibold shadow-sm transition-all cursor-pointer"
                        >
                          Pay Fine
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
