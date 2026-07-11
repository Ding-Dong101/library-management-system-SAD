import React, { useState, useEffect } from 'react';
import { Book, Member, BookCopyDetail, Branch, Category, Author, Publisher, ReportMetrics } from '../types.ts';
import {
  FileText,
  UserPlus,
  BookPlus,
  ArrowLeftRight,
  TrendingUp,
  XCircle,
  CheckCircle,
  Database,
  Search,
  Plus,
  AlertCircle
} from 'lucide-react';

interface LibrarianWorkspaceProps {
  staffMember: { id: number; firstName: string; lastName: string; role: string; branchId: number; email: string };
  onLogout: () => void;
}

export default function LibrarianWorkspace({ staffMember, onLogout }: LibrarianWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'checkout' | 'books' | 'members' | 'inventory' | 'reports'>('checkout');

  // Metadata/Master lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);

  // Sub-states for various features
  const [books, setBooks] = useState<Book[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [copies, setCopies] = useState<BookCopyDetail[]>([]);
  const [reports, setReports] = useState<ReportMetrics | null>(null);

  // Status indicators
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  // FORM INPUTS

  // 1. Checkout Form
  const [chkMemberId, setChkMemberId] = useState('');
  const [chkCopyId, setChkCopyId] = useState('');
  const [chkDueDate, setChkDueDate] = useState('');

  // 2. Return Form
  const [retCopyId, setRetCopyId] = useState('');

  // 3. Add Member Form
  const [mFirst, setMFirst] = useState('');
  const [mLast, setMLast] = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mAddress, setMAddress] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mType, setMType] = useState<'regular' | 'premium' | 'staff'>('regular');

  // 4. Add Book Form
  const [bIsbn, setBIsbn] = useState('');
  const [bTitle, setBTitle] = useState('');
  const [bEdition, setBEdition] = useState('');
  const [bYear, setBYear] = useState('');
  const [bPubId, setBPubId] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bAuthorIds, setBAuthorIds] = useState<number[]>([]);
  const [bCatIds, setBCatIds] = useState<number[]>([]);

  // 5. Add Copy Form
  const [cBookId, setCBookId] = useState('');
  const [cBranchId, setCBranchId] = useState('');

  // 6. Transfer Copy Form
  const [trCopyId, setTrCopyId] = useState('');
  const [trBranchId, setTrBranchId] = useState('');

  useEffect(() => {
    fetchMetadata();
    loadTabContent();
  }, [activeTab]);

  const fetchMetadata = async () => {
    try {
      const [br, cat, aut, pub] = await Promise.all([
        fetch('/api/branches').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/authors').then(r => r.json()),
        fetch('/api/publishers').then(r => r.json())
      ]);
      if (Array.isArray(br)) setBranches(br);
      if (Array.isArray(cat)) setCategories(cat);
      if (Array.isArray(aut)) setAuthors(aut);
      if (Array.isArray(pub)) setPublishers(pub);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTabContent = async () => {
    setLoading(true);
    try {
      if (activeTab === 'books') {
        const res = await fetch('/api/books');
        const data = await res.json();
        if (Array.isArray(data)) setBooks(data);
      } else if (activeTab === 'members') {
        const res = await fetch('/api/members');
        const data = await res.json();
        if (Array.isArray(data)) {
          // Hydrate with profile profiles
          const profiles = await Promise.all(
            data.map(async (m: Member) => {
              const pRes = await fetch(`/api/members/${m.id}`);
              return pRes.json();
            })
          );
          setMembers(profiles);
        }
      } else if (activeTab === 'inventory') {
        const [booksRes, copiesRes] = await Promise.all([
          fetch('/api/books').then(r => r.json()),
          fetch('/api/books/copies/detail').then(r => r.json())
        ]);
        if (Array.isArray(booksRes)) setBooks(booksRes);
        if (Array.isArray(copiesRes)) setCopies(copiesRes);
      } else if (activeTab === 'reports') {
        const res = await fetch('/api/reports/branch');
        const data = await res.json();
        if (data && data.branchMetrics) setReports(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const showStatus = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 8000);
  };

  // HANDLERS

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: chkMemberId,
          copyId: chkCopyId,
          dueDate: chkDueDate || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Checkout completed successfully! Loan ID: ${data.id}`, 'success');
        setChkMemberId('');
        setChkCopyId('');
        setChkDueDate('');
      } else {
        showStatus(data.error || 'Failed to checkout copy', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/loans/return', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: retCopyId }),
      });
      const data = await res.json();
      if (res.ok) {
        let text = 'Book returned successfully!';
        if (data.fine) {
          text += ` An overdue fine of $${Number(data.fine.amount).toFixed(2)} has been charged to the member.`;
        }
        if (data.statusTransition === 'reserved_for_pending_reservation') {
          text += ' This copy is now held (RESERVED) for the next member in the reservation queue.';
        }
        showStatus(text, 'success');
        setRetCopyId('');
      } else {
        showStatus(data.error || 'Failed to process return', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: mFirst,
          lastName: mLast,
          email: mEmail,
          address: mAddress || undefined,
          phone: mPhone || undefined,
          membershipType: mType,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`New member registered successfully! Member ID: ${data.id}`, 'success');
        setMFirst('');
        setMLast('');
        setMEmail('');
        setMAddress('');
        setMPhone('');
        setMType('regular');
        loadTabContent();
      } else {
        showStatus(data.error || 'Registration failed', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleDeleteMember = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this member profile? This action is irreversible.')) return;
    try {
      const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showStatus('Member profile deleted successfully', 'success');
        loadTabContent();
      } else {
        showStatus(data.error || 'Deletion blocked', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bAuthorIds.length === 0 || bCatIds.length === 0) {
      showStatus('Please specify at least one author and one category', 'error');
      return;
    }
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: bIsbn,
          title: bTitle,
          edition: bEdition ? parseInt(bEdition, 10) : undefined,
          publicationYear: bYear ? parseInt(bYear, 10) : undefined,
          publisherId: bPubId ? parseInt(bPubId, 10) : undefined,
          description: bDesc || undefined,
          authorIds: bAuthorIds,
          categoryIds: bCatIds,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Title added to Catalog: ${data.title}`, 'success');
        setBIsbn('');
        setBTitle('');
        setBEdition('');
        setBYear('');
        setBPubId('');
        setBDesc('');
        setBAuthorIds([]);
        setBCatIds([]);
        loadTabContent();
      } else {
        showStatus(data.error || 'Failed to add book', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleDeleteBook = async (id: number) => {
    if (!window.confirm('Delete this book from the catalog?')) return;
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showStatus('Book deleted from catalog', 'success');
        loadTabContent();
      } else {
        showStatus(data.error || 'Failed to delete book', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleAddCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/books/copies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: parseInt(cBookId, 10),
          branchId: parseInt(cBranchId, 10),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Physical copy added successfully! Copy ID: ${data.id}`, 'success');
        setCBookId('');
        setCBranchId('');
        loadTabContent();
      } else {
        showStatus(data.error || 'Failed to add copy', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleTransferCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/books/copies/${trCopyId}/transfer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBranchId: trBranchId }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Copy ${trCopyId} transferred successfully!`, 'success');
        setTrCopyId('');
        setTrBranchId('');
        loadTabContent();
      } else {
        showStatus(data.error || 'Failed to transfer copy', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleWaiveFine = async (fineId: number) => {
    try {
      const res = await fetch(`/api/fines/${fineId}/waive`, { method: 'PUT' });
      if (res.ok) {
        showStatus('Overdue fine administratively waived', 'success');
        loadTabContent();
      } else {
        showStatus('Failed to waive fine', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-16 selection:bg-highlight-geo">
      
      {/* Toast Notification */}
      {message && (
        <div className={`p-6 rounded-none flex items-center justify-between transition-all border ${
          message.type === 'success' ? 'bg-[#E2F5E9] text-[#2D6A4F] border-[#2D6A4F]/10' : 'bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]/10'
        }`}>
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 text-[#2D6A4F]" /> : <AlertCircle className="w-5 h-5 text-[#B91C1C]" />}
            <span className="font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-sm underline hover:opacity-80 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Spacious Librarian Header */}
      <div className="bg-white rounded-none p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-10 border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
        <div className="space-y-3">
          <span className="text-xs font-semibold tracking-[0.25em] text-muted-geo uppercase block">Librarian Workspace</span>
          <h2 className="text-4xl font-semibold tracking-tight text-text-geo">
            {staffMember.firstName} {staffMember.lastName}
          </h2>
          <div className="flex items-center gap-4 text-muted-geo text-sm">
            <span>Role: <strong className="text-text-geo font-medium">{staffMember.role}</strong></span>
            <span>•</span>
            <span>Assigned ID: <strong className="text-text-geo font-medium">#{staffMember.id}</strong></span>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="px-6 py-3 bg-bg-geo hover:bg-highlight-geo text-text-geo rounded-none font-medium shadow-sm transition-all text-sm border border-text-geo/10 cursor-pointer"
        >
          Sign Out of Portal
        </button>
      </div>

      {/* Spacious Tabs selector */}
      <div className="flex flex-wrap gap-4 border-b border-text-geo/10 pb-2">
        {[
          { id: 'checkout', label: 'Circulation Desk', icon: ArrowLeftRight },
          { id: 'books', label: 'Catalog Manager', icon: BookPlus },
          { id: 'members', label: 'Members Ledger', icon: UserPlus },
          { id: 'inventory', label: 'Inventory Dispersion', icon: Database },
          { id: 'reports', label: 'Performance Metrics', icon: TrendingUp },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-6 py-4 rounded-none font-medium text-sm transition-all cursor-pointer ${
                isActive
                  ? 'border-b-2 border-text-geo text-text-geo bg-white'
                  : 'text-muted-geo hover:text-text-geo'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="pt-4">
        {loading && <div className="text-muted-geo text-center py-20">Refreshing system ledgers...</div>}

        {!loading && (
          <>
            {/* 1. CIRCULATION DESK (LOAN / RETURN) */}
            {activeTab === 'checkout' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                {/* Check Out Form */}
                <div className="space-y-8 bg-white p-12 rounded-none border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Issue New Loan</h3>
                    <p className="text-sm text-muted-geo">Atomically assign available copies to members.</p>
                  </div>

                  <form onSubmit={handleCheckout} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Member ID</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 1"
                        value={chkMemberId}
                        onChange={(e) => setChkMemberId(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3.5 rounded-none text-text-geo border border-text-geo/10 placeholder-muted-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all font-sans text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Copy ID</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 4"
                        value={chkCopyId}
                        onChange={(e) => setChkCopyId(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3.5 rounded-none text-text-geo border border-text-geo/10 placeholder-muted-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all font-sans text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Custom Due Date (Optional)</label>
                      <input
                        type="date"
                        value={chkDueDate}
                        onChange={(e) => setChkDueDate(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3.5 rounded-none text-text-geo border border-text-geo/10 focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all font-sans text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none shadow-sm hover:shadow transition-all cursor-pointer"
                    >
                      Authorize Book Loan
                    </button>
                  </form>
                </div>

                {/* Return Form */}
                <div className="space-y-8 bg-white p-12 rounded-none border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Record Copy Return</h3>
                    <p className="text-sm text-muted-geo">Reverts copy status and computes fine if returned late.</p>
                  </div>

                  <form onSubmit={handleReturn} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Copy ID</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 4"
                        value={retCopyId}
                        onChange={(e) => setRetCopyId(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3.5 rounded-none text-text-geo border border-text-geo/10 placeholder-muted-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all font-sans text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none shadow-sm hover:shadow transition-all cursor-pointer"
                    >
                      Register Return & Process Fines
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* 2. CATALOG MANAGER */}
            {activeTab === 'books' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                {/* Left: Add Book Form */}
                <div className="lg:col-span-5 space-y-8 bg-white p-12 rounded-none border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Add Title to Catalog</h3>
                    <p className="text-sm text-muted-geo">Enforces structural relation linking authors & categories.</p>
                  </div>

                  <form onSubmit={handleAddBook} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">ISBN</label>
                        <input
                          type="text"
                          required
                          placeholder="978..."
                          value={bIsbn}
                          onChange={(e) => setBIsbn(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Edition</label>
                        <input
                          type="number"
                          placeholder="e.g. 1"
                          value={bEdition}
                          onChange={(e) => setBEdition(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Title</label>
                      <input
                        type="text"
                        required
                        placeholder="Book Title"
                        value={bTitle}
                        onChange={(e) => setBTitle(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Publication Year</label>
                        <input
                          type="number"
                          placeholder="e.g. 2026"
                          value={bYear}
                          onChange={(e) => setBYear(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Publisher</label>
                        <select
                          value={bPubId}
                          onChange={(e) => setBPubId(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo"
                        >
                          <option value="">Select Publisher</option>
                          {publishers.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Multi Authors select */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Authors (Multiple Selection)</label>
                      <div className="bg-bg-geo p-4 rounded-none border border-text-geo/10 max-h-36 overflow-y-auto space-y-2 text-sm">
                        {authors.map((auth) => {
                          const checked = bAuthorIds.includes(auth.id);
                          return (
                            <label key={auth.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  if (checked) {
                                    setBAuthorIds(bAuthorIds.filter(id => id !== auth.id));
                                  } else {
                                    setBAuthorIds([...bAuthorIds, auth.id]);
                                  }
                                }}
                                className="rounded-none border-text-geo/20 text-accent-geo focus:ring-accent-geo"
                              />
                              <span className="text-text-geo">{auth.firstName} {auth.lastName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Multi Categories select */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Categories (Multiple Selection)</label>
                      <div className="bg-bg-geo p-4 rounded-none border border-text-geo/10 max-h-36 overflow-y-auto space-y-2 text-sm">
                        {categories.map((cat) => {
                          const checked = bCatIds.includes(cat.id);
                          return (
                            <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  if (checked) {
                                    setBCatIds(bCatIds.filter(id => id !== cat.id));
                                  } else {
                                    setBCatIds([...bCatIds, cat.id]);
                                  }
                                }}
                                className="rounded-none border-text-geo/20 text-accent-geo focus:ring-accent-geo"
                              />
                              <span className="text-text-geo">{cat.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Description</label>
                      <textarea
                        placeholder="Description..."
                        value={bDesc}
                        onChange={(e) => setBDesc(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo"
                        rows={3}
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none cursor-pointer transition-all"
                    >
                      Publish to Catalog
                    </button>
                  </form>
                </div>

                {/* Right: Active Book List */}
                <div className="lg:col-span-7 space-y-6">
                  <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Active Titles</h3>
                  
                  <div className="space-y-4">
                    {books.map((b) => (
                      <div key={b.id} className="p-6 hover:bg-highlight-geo/10 bg-white border border-text-geo/5 rounded-none flex items-center justify-between gap-6 transition-all">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted-geo block tracking-widest uppercase">ISBN: {b.isbn}</span>
                          <h4 className="font-semibold text-text-geo leading-snug">{b.title}</h4>
                          <p className="text-xs text-muted-geo">
                            By {b.authors.map(a => `${a.firstName} ${a.lastName}`).join(', ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-xs text-muted-geo block">Total Inventory</span>
                            <span className="text-sm font-bold text-text-geo">{b.totalCopies} physical copies</span>
                          </div>
                          <button
                            onClick={() => handleDeleteBook(b.id)}
                            className="p-2.5 text-rose-600 hover:bg-rose-50 rounded-none transition-all cursor-pointer"
                            title="Delete Book"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3. MEMBERS LEDGER */}
            {activeTab === 'members' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                {/* Left: Register Member Form */}
                <div className="lg:col-span-5 space-y-8 bg-white p-12 rounded-none border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Register Member</h3>
                    <p className="text-sm text-muted-geo">Add a new physical reader to the management database.</p>
                  </div>

                  <form onSubmit={handleAddMember} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">First Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. John"
                          value={mFirst}
                          onChange={(e) => setMFirst(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Last Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Doe"
                          value={mLast}
                          onChange={(e) => setMLast(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Email</label>
                      <input
                        type="email"
                        required
                        placeholder="john.doe@example.com"
                        value={mEmail}
                        onChange={(e) => setMEmail(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Phone</label>
                        <input
                          type="text"
                          placeholder="555-0199"
                          value={mPhone}
                          onChange={(e) => setMPhone(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Membership tier</label>
                        <select
                          value={mType}
                          onChange={(e) => setMType(e.target.value as any)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo"
                        >
                          <option value="regular">Regular</option>
                          <option value="premium">Premium</option>
                          <option value="staff">Staff</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Address</label>
                      <input
                        type="text"
                        placeholder="123 Reader St, Metroville"
                        value={mAddress}
                        onChange={(e) => setMAddress(e.target.value)}
                        className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo focus:outline-none focus:ring-1 focus:ring-accent-geo transition-all text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none cursor-pointer transition-all"
                    >
                      Register Member Card
                    </button>
                  </form>
                </div>

                {/* Right: Active Member Directory */}
                <div className="lg:col-span-7 space-y-6">
                  <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Active Member Ledger</h3>
                  
                  <div className="space-y-4">
                    {members.map((m) => (
                      <div key={m.id} className="p-6 hover:bg-highlight-geo/10 bg-white border border-text-geo/5 rounded-none flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-geo">#{m.id}</span>
                            <span className="px-2 py-0.5 bg-bg-geo text-text-geo border border-text-geo/10 rounded-none text-[10px] font-semibold uppercase tracking-wider capitalize">
                              {m.membershipType}
                            </span>
                          </div>
                          <h4 className="font-semibold text-text-geo text-lg leading-snug">
                            {m.firstName} {m.lastName}
                          </h4>
                          <div className="text-xs text-muted-geo space-y-0.5">
                            <p>Email: <strong className="text-text-geo font-medium">{m.email}</strong></p>
                            <p>Phone: <strong className="text-text-geo font-medium">{m.phone || 'N/A'}</strong></p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right space-y-1">
                            <span className="text-xs text-muted-geo block">Out: <strong className="text-text-geo font-medium">{m.activeLoanCount || 0} books</strong></span>
                            <span className="text-xs text-muted-geo block">Fines: <strong className={`${(m.unpaidFineAmount || 0) > 0 ? 'text-rose-600 font-bold' : 'text-text-geo'}`}>${(m.unpaidFineAmount || 0).toFixed(2)}</strong></span>
                          </div>
                          <button
                            onClick={() => handleDeleteMember(m.id)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-none transition-all cursor-pointer"
                            title="Deactivate / Delete Member"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. INVENTORY MANAGEMENT */}
            {activeTab === 'inventory' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                {/* Left: Add Copy & Transfer Form */}
                <div className="lg:col-span-5 space-y-12">
                  
                  {/* Form: Add copy */}
                  <div className="space-y-8 bg-white p-12 rounded-none border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Add Physical Copy</h3>
                      <p className="text-sm text-muted-geo">Increase available volume of any catalog title.</p>
                    </div>

                    <form onSubmit={handleAddCopy} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Catalog Book Title</label>
                        <select
                          value={cBookId}
                          onChange={(e) => setCBookId(e.target.value)}
                          required
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo"
                        >
                          <option value="">Select Catalog Title</option>
                          {books.map(b => (
                            <option key={b.id} value={b.id}>{b.title} (ISBN: {b.isbn})</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Branch Location</label>
                        <select
                          value={cBranchId}
                          onChange={(e) => setCBranchId(e.target.value)}
                          required
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo"
                        >
                          <option value="">Select Physical Branch</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none cursor-pointer transition-all"
                      >
                        Authorize Copy Acquisition
                      </button>
                    </form>
                  </div>

                  {/* Form: Transfer copy */}
                  <div className="space-y-8 bg-white p-12 rounded-none border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Inter-Branch Transfer</h3>
                      <p className="text-sm text-muted-geo">Move an "available" copy physically between library branches.</p>
                    </div>

                    <form onSubmit={handleTransferCopy} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Copy ID</label>
                        <input
                          type="number"
                          required
                          placeholder="e.g. 1"
                          value={trCopyId}
                          onChange={(e) => setTrCopyId(e.target.value)}
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 placeholder-muted-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo text-text-geo"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-geo uppercase tracking-widest block">Target Branch</label>
                        <select
                          value={trBranchId}
                          onChange={(e) => setTrBranchId(e.target.value)}
                          required
                          className="w-full bg-bg-geo px-4 py-3 rounded-none border border-text-geo/10 text-text-geo text-sm focus:outline-none focus:ring-1 focus:ring-accent-geo"
                        >
                          <option value="">Select Physical Branch</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-4 bg-text-geo hover:bg-accent-geo text-white font-semibold rounded-none cursor-pointer transition-all"
                      >
                        Initiate Transit Transfer
                      </button>
                    </form>
                  </div>

                </div>

                {/* Right: Copy Inventory Table */}
                <div className="lg:col-span-7 space-y-6">
                  <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Physical Inventory Registry</h3>
                  
                  <div className="space-y-4">
                    {copies.map((c) => (
                      <div key={c.id} className="p-6 hover:bg-highlight-geo/10 bg-white border border-text-geo/5 rounded-none flex items-center justify-between gap-6 transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-geo">Copy ID: #{c.id}</span>
                            <span className="text-xs text-muted-geo">• ISBN: {c.isbn}</span>
                          </div>
                          <h4 className="font-semibold text-text-geo leading-snug">{c.bookTitle}</h4>
                          <p className="text-xs text-muted-geo">
                            Current Location: <strong className="text-text-geo font-medium">{c.branchName}</strong>
                          </p>
                        </div>

                        <div className="text-right space-y-1">
                          <span className={`px-2 py-0.5 rounded-none border text-[10px] font-bold block text-center uppercase tracking-wider ${
                            c.status === 'available' ? 'bg-[#E2F5E9] text-[#2D6A4F] border-[#2D6A4F]/10' :
                            c.status === 'loaned' ? 'bg-[#FFF4E5] text-[#B07D05] border-[#B07D05]/10' :
                            c.status === 'reserved' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                            'bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]/10'
                          }`}>
                            {c.status}
                          </span>
                          <span className="text-[10px] text-muted-geo block pt-1">
                            Acquired {c.acquisitionDate ? new Date(c.acquisitionDate).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. PERFORMANCE REPORTS */}
            {activeTab === 'reports' && reports && (
              <div className="space-y-16">
                
                {/* Branch KPIs */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Active Branch Performance</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {reports.branchMetrics.map((m) => (
                      <div key={m.branchId} className="bg-white p-8 rounded-none space-y-4 hover:bg-highlight-geo/10 border border-text-geo/5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] transition-all">
                        <div className="space-y-1">
                          <h4 className="text-xl font-semibold text-text-geo">{m.branchName}</h4>
                          <p className="text-xs text-muted-geo">{m.location}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-text-geo/10">
                          <div>
                            <span className="text-[10px] uppercase text-muted-geo block font-semibold">Total Stock</span>
                            <span className="text-lg font-bold text-text-geo">{m.totalCopies}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-muted-geo block font-semibold">Active Out</span>
                            <span className="text-lg font-bold text-text-geo">{m.activeLoans}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-muted-geo block font-semibold">Fine Revenue</span>
                            <span className="text-lg font-bold text-emerald-600">${m.fineRevenue.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Popular Books Chart/Rows */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-semibold text-text-geo tracking-tight">Popular Library Materials</h3>
                  
                  <div className="bg-white rounded-none border border-text-geo/5 p-8 space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
                    {reports.popularBooks.length === 0 ? (
                      <p className="text-muted-geo text-center py-6">No circulation history to generate statistics.</p>
                    ) : (
                      <div className="space-y-4">
                        {reports.popularBooks.map((b, index) => (
                          <div key={b.isbn} className="flex items-center justify-between p-4 hover:bg-highlight-geo/10 border border-text-geo/5 rounded-none transition-all">
                            <div className="flex items-center gap-4">
                              <span className="text-lg font-extrabold text-[#3E5C76] w-8">
                                #{(index + 1).toString().padStart(2, '0')}
                              </span>
                              <div className="space-y-0.5">
                                <h4 className="font-semibold text-text-geo">{b.title}</h4>
                                <span className="text-xs text-muted-geo">ISBN: {b.isbn}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-muted-geo block">Total Check-Outs</span>
                              <span className="text-sm font-bold text-text-geo">{b.loanCount} times</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
