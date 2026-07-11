export interface Author {
  id: number;
  firstName: string;
  lastName: string;
  biography: string | null;
}

export interface Category {
  id: number;
  name: string;
}

export interface Publisher {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface Branch {
  id: number;
  name: string;
  location: string;
  phone: string | null;
}

export interface Book {
  id: number;
  isbn: string;
  title: string;
  edition: number | null;
  publicationYear: number | null;
  publisherId: number | null;
  description: string | null;
  authors: { id: number; firstName: string; lastName: string }[];
  categories: { id: number; name: string }[];
  publisher: Publisher | null;
  totalCopies: number;
  availableCopies: number;
}

export interface BookCopyDetail {
  id: number;
  bookId: number;
  branchId: number;
  status: 'available' | 'loaned' | 'reserved' | 'lost';
  acquisitionDate: string | null;
  bookTitle: string;
  isbn: string;
  branchName: string;
}

export interface Member {
  id: number;
  uid: string | null;
  firstName: string;
  lastName: string;
  address: string | null;
  phone: string | null;
  email: string;
  membershipDate: string;
  membershipType: 'regular' | 'premium' | 'staff';
  activeLoanCount?: number;
  unpaidFineAmount?: number;
}

export interface Loan {
  loanId: number;
  copyId: number;
  loanDate: string;
  dueDate: string;
  returnDate: string | null;
  bookTitle: string;
  isbn: string;
  branchName: string;
}

export interface Fine {
  fineId: number;
  amount: string;
  paidStatus: boolean;
  issueDate: string;
  loanId: number;
  bookTitle: string;
  loanDate: string;
  dueDate: string;
  returnDate: string | null;
}

export interface Reservation {
  reservationId: number;
  reservationDate: string;
  status: 'pending' | 'fulfilled' | 'cancelled' | 'expired';
  expirationDate: string;
  bookTitle: string;
  isbn: string;
  branchName: string;
}

export interface Staff {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  branchId: number;
  email: string;
}

export interface BranchMetric {
  branchId: number;
  branchName: string;
  location: string;
  totalCopies: number;
  activeLoans: number;
  fineRevenue: number;
}

export interface PopularBookMetric {
  title: string;
  isbn: string;
  loanCount: number;
}

export interface ReportMetrics {
  branchMetrics: BranchMetric[];
  popularBooks: PopularBookMetric[];
}
