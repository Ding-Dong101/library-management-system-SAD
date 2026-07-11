import { db } from '../db/index.ts';
import {
  publisher,
  author,
  book,
  bookAuthor,
  category,
  bookCategory,
  libraryBranch,
  bookCopy,
  member,
  loan,
  fine,
  reservation,
  staff
} from '../db/schema.ts';
import { eq, and, or, like, sql, desc, count, sum, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// Helper to sanitize database exceptions and throw clean generic errors
function handleDbError(operation: string, error: any): never {
  console.error(`Database error during ${operation}:`, error);
  throw new Error(`Failed to ${operation}. Please try again later.`, { cause: error });
}

// -------------------------------------------------------------
// 1. MEMBER SERVICE
// -------------------------------------------------------------

export async function registerMember(data: {
  firstName: string;
  lastName: string;
  email: string;
  address?: string;
  phone?: string;
  membershipType?: 'regular' | 'premium' | 'staff';
  uid?: string;
}) {
  try {
    // Check email uniqueness
    const existing = await db.select().from(member).where(eq(member.email, data.email)).limit(1);
    if (existing.length > 0) {
      throw new Error('Email already registered');
    }

    const result = await db.insert(member).values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      address: data.address || null,
      phone: data.phone || null,
      membershipType: data.membershipType || 'regular',
      uid: data.uid || null,
    }).returning();

    return result[0];
  } catch (error: any) {
    if (error.message === 'Email already registered') throw error;
    handleDbError('register member', error);
  }
}

export async function getMemberProfileByEmail(email: string) {
  try {
    const res = await db.select().from(member).where(eq(member.email, email)).limit(1);
    if (res.length === 0) return null;
    return getMemberProfile(res[0].id);
  } catch (error) {
    handleDbError('get member profile by email', error);
  }
}

export async function getMemberProfileByUid(uid: string) {
  try {
    const res = await db.select().from(member).where(eq(member.uid, uid)).limit(1);
    if (res.length === 0) return null;
    return getMemberProfile(res[0].id);
  } catch (error) {
    handleDbError('get member profile by uid', error);
  }
}

export async function getMemberProfile(memberId: number) {
  try {
    const mList = await db.select().from(member).where(eq(member.id, memberId)).limit(1);
    if (mList.length === 0) {
      throw new Error('Member not found');
    }
    const mem = mList[0];

    // Count current active loans (returnDate is null)
    const activeLoansRes = await db
      .select({ count: count() })
      .from(loan)
      .where(and(eq(loan.memberId, memberId), isNull(loan.returnDate)));
    const activeLoanCount = activeLoansRes[0]?.count || 0;

    // Sum unpaid fines
    const unpaidFinesRes = await db
      .select({ sum: sum(fine.amount) })
      .from(fine)
      .innerJoin(loan, eq(fine.loanId, loan.id))
      .where(and(eq(loan.memberId, memberId), eq(fine.paidStatus, false)));
    const unpaidFineAmount = Number(unpaidFinesRes[0]?.sum || 0);

    return {
      ...mem,
      activeLoanCount,
      unpaidFineAmount,
    };
  } catch (error: any) {
    if (error.message === 'Member not found') throw error;
    handleDbError('fetch member profile', error);
  }
}

export async function updateMember(memberId: number, data: {
  firstName?: string;
  lastName?: string;
  address?: string;
  phone?: string;
  membershipType?: 'regular' | 'premium' | 'staff';
}) {
  try {
    const result = await db.update(member)
      .set(data)
      .where(eq(member.id, memberId))
      .returning();
    return result[0];
  } catch (error) {
    handleDbError('update member', error);
  }
}

export async function deactivateOrDeleteMember(memberId: number) {
  try {
    // Restricts if member has active loans or unpaid fines
    const profile = await getMemberProfile(memberId);
    if (profile.activeLoanCount > 0) {
      throw new Error('Cannot delete member: active loans exist');
    }
    if (profile.unpaidFineAmount > 0) {
      throw new Error('Cannot delete member: unpaid fines exist');
    }

    // Attempt deletion
    await db.delete(member).where(eq(member.id, memberId));
    return { success: true };
  } catch (error: any) {
    if (error.message.includes('Cannot delete member')) throw error;
    handleDbError('delete member', error);
  }
}

export async function getMemberLoans(memberId: number) {
  try {
    return await db.select({
      loanId: loan.id,
      copyId: loan.copyId,
      loanDate: loan.loanDate,
      dueDate: loan.dueDate,
      returnDate: loan.returnDate,
      bookTitle: book.title,
      isbn: book.isbn,
      branchName: libraryBranch.name,
    })
    .from(loan)
    .innerJoin(bookCopy, eq(loan.copyId, bookCopy.id))
    .innerJoin(book, eq(bookCopy.bookId, book.id))
    .innerJoin(libraryBranch, eq(bookCopy.branchId, libraryBranch.id))
    .where(eq(loan.memberId, memberId))
    .orderBy(desc(loan.loanDate));
  } catch (error) {
    handleDbError('fetch member loans', error);
  }
}

export async function getMemberReservations(memberId: number) {
  try {
    return await db.select({
      reservationId: reservation.id,
      reservationDate: reservation.reservationDate,
      status: reservation.status,
      expirationDate: reservation.expirationDate,
      bookTitle: book.title,
      isbn: book.isbn,
      branchName: libraryBranch.name,
    })
    .from(reservation)
    .innerJoin(book, eq(reservation.bookId, book.id))
    .innerJoin(libraryBranch, eq(reservation.branchId, libraryBranch.id))
    .where(eq(reservation.memberId, memberId))
    .orderBy(desc(reservation.reservationDate));
  } catch (error) {
    handleDbError('fetch member reservations', error);
  }
}

export async function getMemberFines(memberId: number) {
  try {
    return await db.select({
      fineId: fine.id,
      amount: fine.amount,
      paidStatus: fine.paidStatus,
      issueDate: fine.issueDate,
      loanId: fine.loanId,
      bookTitle: book.title,
      loanDate: loan.loanDate,
      dueDate: loan.dueDate,
      returnDate: loan.returnDate,
    })
    .from(fine)
    .innerJoin(loan, eq(fine.loanId, loan.id))
    .innerJoin(bookCopy, eq(loan.copyId, bookCopy.id))
    .innerJoin(book, eq(bookCopy.bookId, book.id))
    .where(eq(loan.memberId, memberId))
    .orderBy(desc(fine.issueDate));
  } catch (error) {
    handleDbError('fetch member fines', error);
  }
}

export async function getAllMembers() {
  try {
    return await db.select().from(member).orderBy(member.id);
  } catch (error) {
    handleDbError('fetch all members', error);
  }
}


// -------------------------------------------------------------
// 2. CATALOG SERVICE
// -------------------------------------------------------------

export async function addBook(data: {
  isbn: string;
  title: string;
  edition?: number;
  publicationYear?: number;
  publisherId?: number;
  description?: string;
  authorIds: number[];
  categoryIds: number[];
}) {
  try {
    // Check ISBN uniqueness
    const existing = await db.select().from(book).where(eq(book.isbn, data.isbn)).limit(1);
    if (existing.length > 0) {
      throw new Error('Book with this ISBN already exists');
    }

    return await db.transaction(async (tx) => {
      // Insert Book
      const insertedBookList = await tx.insert(book).values({
        isbn: data.isbn,
        title: data.title,
        edition: data.edition || null,
        publicationYear: data.publicationYear || null,
        publisherId: data.publisherId || null,
        description: data.description || null,
      }).returning();
      const newBook = insertedBookList[0];

      // Insert Authors relation
      if (data.authorIds && data.authorIds.length > 0) {
        await tx.insert(bookAuthor).values(
          data.authorIds.map((aId) => ({
            bookId: newBook.id,
            authorId: aId,
          }))
        );
      }

      // Insert Categories relation
      if (data.categoryIds && data.categoryIds.length > 0) {
        await tx.insert(bookCategory).values(
          data.categoryIds.map((cId) => ({
            bookId: newBook.id,
            categoryId: cId,
          }))
        );
      }

      return newBook;
    });
  } catch (error: any) {
    if (error.message.includes('ISBN already exists')) throw error;
    handleDbError('add book to catalog', error);
  }
}

export async function deleteBook(bookId: number) {
  try {
    // Block if any physical copies exist
    const copies = await db.select().from(bookCopy).where(eq(bookCopy.bookId, bookId)).limit(1);
    if (copies.length > 0) {
      throw new Error('Cannot delete book: physical copies exist in the inventory');
    }

    await db.delete(book).where(eq(book.id, bookId));
    return { success: true };
  } catch (error: any) {
    if (error.message.includes('Cannot delete book')) throw error;
    handleDbError('delete book', error);
  }
}

export async function searchBooks(query: string, limit = 20, offset = 0) {
  try {
    const q = `%${query}%`;

    // Fetch base books matching title, ISBN, publisher name, author name, or category name
    // We use a custom SQL subquery or direct filters
    const matchedBooks = await db.execute(sql`
      SELECT DISTINCT b.book_id
      FROM book b
      LEFT JOIN publisher p ON b.publisher_id = p.publisher_id
      LEFT JOIN book_author ba ON b.book_id = ba.book_id
      LEFT JOIN author a ON ba.author_id = a.author_id
      LEFT JOIN book_category bc ON b.book_id = bc.book_id
      LEFT JOIN category c ON bc.category_id = c.category_id
      WHERE b.title ILIKE ${q}
         OR b.isbn ILIKE ${q}
         OR p.name ILIKE ${q}
         OR a.first_name ILIKE ${q}
         OR a.last_name ILIKE ${q}
         OR c.name ILIKE ${q}
      ORDER BY b.book_id
      LIMIT ${limit} OFFSET ${offset}
    `);

    const ids = matchedBooks.rows.map((row: any) => row.book_id as number);
    if (ids.length === 0) return [];

    // Let's load full detail for these matching books
    const fullBooks = await Promise.all(
      ids.map(async (bookId) => {
        const bookDetails = await db.select().from(book).where(eq(book.id, bookId)).limit(1);
        const bDetail = bookDetails[0];

        // Fetch Authors
        const authorsRes = await db.select({
          id: author.id,
          firstName: author.firstName,
          lastName: author.lastName,
        })
        .from(bookAuthor)
        .innerJoin(author, eq(bookAuthor.authorId, author.id))
        .where(eq(bookAuthor.bookId, bookId));

        // Fetch Categories
        const categoriesRes = await db.select({
          id: category.id,
          name: category.name,
        })
        .from(bookCategory)
        .innerJoin(category, eq(bookCategory.categoryId, category.id))
        .where(eq(bookCategory.bookId, bookId));

        // Fetch Publisher
        let pubDetail = null;
        if (bDetail.publisherId) {
          const pubRes = await db.select().from(publisher).where(eq(publisher.id, bDetail.publisherId)).limit(1);
          pubDetail = pubRes[0] || null;
        }

        // Fetch Copy counts & availability
        const copies = await db.select().from(bookCopy).where(eq(bookCopy.bookId, bookId));
        const totalCopies = copies.length;
        const availableCopies = copies.filter(c => c.status === 'available').length;

        return {
          ...bDetail,
          authors: authorsRes,
          categories: categoriesRes,
          publisher: pubDetail,
          totalCopies,
          availableCopies,
        };
      })
    );

    return fullBooks;
  } catch (error) {
    handleDbError('search books', error);
  }
}

export async function getAllBooksDetail() {
  return searchBooks('', 1000, 0);
}


// -------------------------------------------------------------
// 3. INVENTORY SERVICE
// -------------------------------------------------------------

export async function addBookCopy(data: {
  bookId: number;
  branchId: number;
  status?: 'available' | 'loaned' | 'reserved' | 'lost';
  acquisitionDate?: string; // YYYY-MM-DD
}) {
  try {
    const result = await db.insert(bookCopy).values({
      bookId: data.bookId,
      branchId: data.branchId,
      status: data.status || 'available',
      acquisitionDate: data.acquisitionDate || new Date().toISOString().split('T')[0],
    }).returning();
    return result[0];
  } catch (error) {
    handleDbError('add book copy', error);
  }
}

export async function updateCopyStatus(copyId: number, status: 'available' | 'loaned' | 'reserved' | 'lost') {
  try {
    const result = await db.update(bookCopy)
      .set({ status })
      .where(eq(bookCopy.id, copyId))
      .returning();
    return result[0];
  } catch (error) {
    handleDbError('update copy status', error);
  }
}

export async function getAvailableCopies(bookId: number, branchId?: number) {
  try {
    let conditions = and(eq(bookCopy.bookId, bookId), eq(bookCopy.status, 'available'));
    if (branchId) {
      conditions = and(conditions, eq(bookCopy.branchId, branchId));
    }
    return await db.select().from(bookCopy).where(conditions);
  } catch (error) {
    handleDbError('fetch available copies', error);
  }
}

export async function transferCopy(copyId: number, targetBranchId: number) {
  try {
    return await db.transaction(async (tx) => {
      // Row-level lock using raw select for update to be absolutely safe
      const copiesLocked = await tx.execute(sql`
        SELECT status FROM book_copy WHERE copy_id = ${copyId} FOR UPDATE
      `);

      if (copiesLocked.rows.length === 0) {
        throw new Error('Book copy not found');
      }

      const currentStatus = copiesLocked.rows[0].status;
      if (currentStatus !== 'available') {
        throw new Error(`Cannot transfer copy: copy is currently ${currentStatus}`);
      }

      const updated = await tx.update(bookCopy)
        .set({ branchId: targetBranchId })
        .where(eq(bookCopy.id, copyId))
        .returning();

      return updated[0];
    });
  } catch (error: any) {
    if (error.message.includes('copy is currently') || error.message === 'Book copy not found') throw error;
    handleDbError('transfer book copy', error);
  }
}


// -------------------------------------------------------------
// 4. CIRCULATION SERVICE (CORE TRANSACTIONAL ENGINE)
// -------------------------------------------------------------

export async function loanBook(memberId: number, copyId: number, dueDateStr?: string) {
  try {
    return await db.transaction(async (tx) => {
      // 1. Row-level lock the book copy to prevent race conditions
      const lockRes = await tx.execute(sql`
        SELECT status, book_id FROM book_copy WHERE copy_id = ${copyId} FOR UPDATE
      `);

      if (lockRes.rows.length === 0) {
        throw new Error('Book copy not found');
      }

      const copyData = lockRes.rows[0];
      if (copyData.status !== 'available') {
        throw new Error(`Book copy is not available for loan (current status: ${copyData.status})`);
      }

      // 2. Aggregated query to check member's unpaid fines > $10
      const unpaidFines = await tx.execute(sql`
        SELECT COALESCE(SUM(f.amount), 0) as total_unpaid
        FROM fine f
        INNER JOIN loan l ON f.loan_id = l.loan_id
        WHERE l.member_id = ${memberId} AND f.paid_status = FALSE
      `);

      const totalUnpaidFine = Number(unpaidFines.rows[0]?.total_unpaid || 0);
      if (totalUnpaidFine > 10.00) {
        throw new Error(`Loan blocked: Member has outstanding unpaid fines of $${totalUnpaidFine.toFixed(2)} (exceeds $10.00 limit)`);
      }

      // 3. Atomically insert Loan
      const today = new Date();
      const due = dueDateStr ? new Date(dueDateStr) : new Date();
      if (!dueDateStr) {
        due.setDate(today.getDate() + 14); // 14-day standard loan period
      }

      const insertedLoanList = await tx.insert(loan).values({
        copyId,
        memberId,
        loanDate: today.toISOString().split('T')[0],
        dueDate: due.toISOString().split('T')[0],
      }).returning();

      // 4. Update Copy status to 'loaned'
      await tx.update(bookCopy)
        .set({ status: 'loaned' })
        .where(eq(bookCopy.id, copyId));

      return insertedLoanList[0];
    });
  } catch (error: any) {
    if (error.message.includes('not available') || error.message.includes('Loan blocked') || error.message === 'Book copy not found') {
      throw error;
    }
    handleDbError('loan book', error);
  }
}

export async function returnBook(copyId: number) {
  try {
    return await db.transaction(async (tx) => {
      // 1. Lock the copy and locate the active loan
      const lockRes = await tx.execute(sql`
        SELECT copy_id, book_id, branch_id FROM book_copy WHERE copy_id = ${copyId} FOR UPDATE
      `);

      if (lockRes.rows.length === 0) {
        throw new Error('Book copy not found');
      }

      const copyData = lockRes.rows[0];

      const activeLoanRes = await tx.select()
        .from(loan)
        .where(and(eq(loan.copyId, copyId), isNull(loan.returnDate)))
        .limit(1);

      if (activeLoanRes.length === 0) {
        throw new Error('No active loan found for this book copy');
      }

      const activeLoan = activeLoanRes[0];
      const todayStr = new Date().toISOString().split('T')[0];

      // Update return date
      await tx.update(loan)
        .set({ returnDate: todayStr })
        .where(eq(loan.id, activeLoan.id));

      // 2. Check for Overdue Fine
      const due = new Date(activeLoan.dueDate);
      const today = new Date();
      let fineCreated = null;

      if (today > due) {
        const diffTime = Math.abs(today.getTime() - due.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const fineAmount = diffDays * 0.50; // $0.50/day standard rate

        if (fineAmount > 0) {
          const fineList = await tx.insert(fine).values({
            loanId: activeLoan.id,
            amount: fineAmount.toFixed(2),
            paidStatus: false,
            issueDate: todayStr,
          }).returning();
          fineCreated = fineList[0];
        }
      }

      // 3. FIFO Reservation Queue Handling for Book Title
      const pendingReservationRes = await tx.select()
        .from(reservation)
        .where(and(eq(reservation.bookId, copyData.book_id as number), eq(reservation.status, 'pending')))
        .orderBy(reservation.reservationDate)
        .limit(1);

      if (pendingReservationRes.length > 0) {
        const nextRes = pendingReservationRes[0];

        // Mark Reservation fulfilled
        await tx.update(reservation)
          .set({ status: 'fulfilled' })
          .where(eq(reservation.id, nextRes.id));

        // Mark Copy status as 'reserved' instead of available
        await tx.update(bookCopy)
          .set({ status: 'reserved' })
          .where(eq(bookCopy.id, copyId));

        return {
          loanId: activeLoan.id,
          returnDate: todayStr,
          fine: fineCreated,
          statusTransition: 'reserved_for_pending_reservation',
          reservedForMemberId: nextRes.memberId,
        };
      } else {
        // Mark Copy status as 'available'
        await tx.update(bookCopy)
          .set({ status: 'available' })
          .where(eq(bookCopy.id, copyId));

        return {
          loanId: activeLoan.id,
          returnDate: todayStr,
          fine: fineCreated,
          statusTransition: 'available',
        };
      }
    });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('No active loan')) {
      throw error;
    }
    handleDbError('return book', error);
  }
}

export async function renewLoan(loanId: number) {
  try {
    return await db.transaction(async (tx) => {
      const activeLoanRes = await tx.select().from(loan).where(eq(loan.id, loanId)).limit(1);
      if (activeLoanRes.length === 0) {
        throw new Error('Loan not found');
      }

      const activeLoan = activeLoanRes[0];
      if (activeLoan.returnDate) {
        throw new Error('Cannot renew loan: book has already been returned');
      }

      // Find book copy details
      const copyRes = await tx.select().from(bookCopy).where(eq(bookCopy.id, activeLoan.copyId)).limit(1);
      const copyData = copyRes[0];

      // Check if another member has a pending reservation on that title
      const pendingRes = await tx.select()
        .from(reservation)
        .where(and(eq(reservation.bookId, copyData.bookId), eq(reservation.status, 'pending')))
        .limit(1);

      if (pendingRes.length > 0) {
        throw new Error('Cannot renew loan: a reservation is pending on this book title by another member');
      }

      // Extend due date by 14 days
      const currentDue = new Date(activeLoan.dueDate);
      currentDue.setDate(currentDue.getDate() + 14);
      const newDueStr = currentDue.toISOString().split('T')[0];

      const updated = await tx.update(loan)
        .set({ dueDate: newDueStr })
        .where(eq(loan.id, loanId))
        .returning();

      return updated[0];
    });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('Cannot renew')) {
      throw error;
    }
    handleDbError('renew loan', error);
  }
}


// -------------------------------------------------------------
// 5. RESERVATION SERVICE
// -------------------------------------------------------------

export async function placeReservation(data: {
  bookId: number;
  memberId: number;
  branchId: number;
}) {
  try {
    return await db.transaction(async (tx) => {
      // Cap active reservations per user (max 5 pending reservations)
      const activeReservations = await tx.select({ count: count() })
        .from(reservation)
        .where(and(eq(reservation.memberId, data.memberId), eq(reservation.status, 'pending')));

      const totalActive = activeReservations[0]?.count || 0;
      if (totalActive >= 5) {
        throw new Error('Reservation blocked: Maximum active reservations limit reached (max 5)');
      }

      const today = new Date();
      const expires = new Date();
      expires.setDate(today.getDate() + 7); // Reservation is active for 7 days standard holding/pickup wait

      const result = await tx.insert(reservation).values({
        bookId: data.bookId,
        memberId: data.memberId,
        branchId: data.branchId,
        status: 'pending',
        expirationDate: expires.toISOString().split('T')[0],
      }).returning();

      return result[0];
    });
  } catch (error: any) {
    if (error.message.includes('limit reached')) throw error;
    handleDbError('place reservation', error);
  }
}

export async function fulfillReservation(reservationId: number) {
  try {
    const result = await db.update(reservation)
      .set({ status: 'fulfilled' })
      .where(eq(reservation.id, reservationId))
      .returning();
    return result[0];
  } catch (error) {
    handleDbError('fulfill reservation', error);
  }
}

export async function expireOldReservations() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const expiredRes = await db.execute(sql`
      UPDATE reservation
      SET status = 'expired'
      WHERE status = 'pending' AND expiration_date < ${todayStr}
      RETURNING reservation_id
    `);
    return { count: expiredRes.rows.length };
  } catch (error) {
    handleDbError('expire old reservations', error);
  }
}


// -------------------------------------------------------------
// 6. FINE & PAYMENT SERVICE
// -------------------------------------------------------------

export async function getMemberTotalUnpaidFine(memberId: number) {
  try {
    const res = await db.select({ sum: sum(fine.amount) })
      .from(fine)
      .innerJoin(loan, eq(fine.loanId, loan.id))
      .where(and(eq(loan.memberId, memberId), eq(fine.paidStatus, false)));
    return Number(res[0]?.sum || 0);
  } catch (error) {
    handleDbError('fetch total unpaid fines', error);
  }
}

export async function payFine(fineId: number) {
  try {
    const result = await db.update(fine)
      .set({ paidStatus: true })
      .where(eq(fine.id, fineId))
      .returning();
    return result[0];
  } catch (error) {
    handleDbError('pay fine', error);
  }
}

export async function waiveFine(fineId: number) {
  try {
    // Administratively waive fine by setting amount to 0 and marking paidStatus as true
    const result = await db.update(fine)
      .set({ amount: '0.00', paidStatus: true })
      .where(eq(fine.id, fineId))
      .returning();
    return result[0];
  } catch (error) {
    handleDbError('waive fine', error);
  }
}


// -------------------------------------------------------------
// 7. STAFF & ADMINISTRATIVE SERVICE
// -------------------------------------------------------------

export async function addStaff(data: {
  firstName: string;
  lastName: string;
  role: string;
  branchId: number;
  email: string;
  passwordRaw: string;
}) {
  try {
    const existing = await db.select().from(staff).where(eq(staff.email, data.email)).limit(1);
    if (existing.length > 0) {
      throw new Error('Staff email already registered');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.passwordRaw, salt);

    const result = await db.insert(staff).values({
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      branchId: data.branchId,
      email: data.email,
      passwordHash,
    }).returning();

    return {
      id: result[0].id,
      firstName: result[0].firstName,
      lastName: result[0].lastName,
      role: result[0].role,
      branchId: result[0].branchId,
      email: result[0].email,
    };
  } catch (error: any) {
    if (error.message.includes('already registered')) throw error;
    handleDbError('add staff member', error);
  }
}

export async function authenticateStaff(email: string, passwordRaw: string) {
  try {
    const res = await db.select().from(staff).where(eq(staff.email, email)).limit(1);
    if (res.length === 0) {
      throw new Error('Invalid email or password');
    }

    const staffMember = res[0];
    const isMatch = await bcrypt.compare(passwordRaw, staffMember.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    return {
      id: staffMember.id,
      firstName: staffMember.firstName,
      lastName: staffMember.lastName,
      role: staffMember.role,
      branchId: staffMember.branchId,
      email: staffMember.email,
    };
  } catch (error: any) {
    if (error.message === 'Invalid email or password') throw error;
    handleDbError('authenticate staff member', error);
  }
}

export async function getBranchReports() {
  try {
    // 1. Total branch loans and inventory counts
    const branches = await db.select().from(libraryBranch);

    const reports = await Promise.all(
      branches.map(async (br) => {
        // Copies at branch
        const copiesRes = await db.select({ count: count() })
          .from(bookCopy)
          .where(eq(bookCopy.branchId, br.id));
        const totalCopies = copiesRes[0]?.count || 0;

        // Active loans from this branch
        const activeLoansRes = await db.select({ count: count() })
          .from(loan)
          .innerJoin(bookCopy, eq(loan.copyId, bookCopy.id))
          .where(and(eq(bookCopy.branchId, br.id), isNull(loan.returnDate)));
        const activeLoans = activeLoansRes[0]?.count || 0;

        // Fine revenue collected
        const revenueRes = await db.select({ sum: sum(fine.amount) })
          .from(fine)
          .innerJoin(loan, eq(fine.loanId, loan.id))
          .innerJoin(bookCopy, eq(loan.copyId, bookCopy.id))
          .where(and(eq(bookCopy.branchId, br.id), eq(fine.paidStatus, true)));
        const fineRevenue = Number(revenueRes[0]?.sum || 0);

        return {
          branchId: br.id,
          branchName: br.name,
          location: br.location,
          totalCopies,
          activeLoans,
          fineRevenue,
        };
      })
    );

    // 2. Popular books (aggregated loans count)
    const popularBooks = await db.execute(sql`
      SELECT b.title, b.isbn, COUNT(l.loan_id) as loan_count
      FROM book b
      INNER JOIN book_copy bc ON b.book_id = bc.book_id
      INNER JOIN loan l ON bc.copy_id = l.copy_id
      GROUP BY b.book_id, b.title, b.isbn
      ORDER BY loan_count DESC
      LIMIT 10
    `);

    return {
      branchMetrics: reports,
      popularBooks: popularBooks.rows.map((row: any) => ({
        title: row.title as string,
        isbn: row.isbn as string,
        loanCount: Number(row.loan_count || 0),
      })),
    };
  } catch (error) {
    handleDbError('generate branch reports', error);
  }
}


// -------------------------------------------------------------
// MASTER/METADATA FETCHERS
// -------------------------------------------------------------

export async function getAllPublishers() {
  try {
    return await db.select().from(publisher).orderBy(publisher.name);
  } catch (error) {
    handleDbError('fetch publishers', error);
  }
}

export async function getAllAuthors() {
  try {
    return await db.select().from(author).orderBy(author.lastName);
  } catch (error) {
    handleDbError('fetch authors', error);
  }
}

export async function getAllCategories() {
  try {
    return await db.select().from(category).orderBy(category.name);
  } catch (error) {
    handleDbError('fetch categories', error);
  }
}

export async function getAllBranches() {
  try {
    return await db.select().from(libraryBranch).orderBy(libraryBranch.name);
  } catch (error) {
    handleDbError('fetch branches', error);
  }
}

export async function getBookCopiesDetail() {
  try {
    return await db.select({
      id: bookCopy.id,
      bookId: bookCopy.bookId,
      branchId: bookCopy.branchId,
      status: bookCopy.status,
      acquisitionDate: bookCopy.acquisitionDate,
      bookTitle: book.title,
      isbn: book.isbn,
      branchName: libraryBranch.name,
    })
    .from(bookCopy)
    .innerJoin(book, eq(bookCopy.bookId, book.id))
    .innerJoin(libraryBranch, eq(bookCopy.branchId, libraryBranch.id))
    .orderBy(desc(bookCopy.id));
  } catch (error) {
    handleDbError('fetch book copies detail', error);
  }
}

export async function seedDatabaseIfEmpty() {
  try {
    const existingBranches = await db.select().from(libraryBranch).limit(1);
    if (existingBranches.length > 0) {
      console.log('Database already has data. Skipping seed.');
      return;
    }

    console.log('Database is empty. Seeding initial data...');
    await db.transaction(async (tx) => {
      // 1. Seed Library Branches
      const insertedBranches = await tx.insert(libraryBranch).values([
        { name: 'London Central Branch', location: '100 Lexend Way, London', phone: '020-7946-0192' },
        { name: 'Manchester Community Branch', location: '55 Library Road, Manchester', phone: '0161-496-0248' }
      ]).returning();

      const b1Id = insertedBranches[0].id;
      const b2Id = insertedBranches[1].id;

      // 2. Seed Default Staff Member
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('password123', salt);
      await tx.insert(staff).values({
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'Head Librarian',
        branchId: b1Id,
        email: 'staff@library.com',
        passwordHash,
      });

      // 3. Seed Publishers
      const insertedPublishers = await tx.insert(publisher).values([
        { name: 'Penguin Books', address: '80 Strand, London', phone: '020-7139-3000' },
        { name: 'HarperCollins', address: '103 Westerhill Rd, Bishopbriggs', phone: '0141-306-3100' }
      ]).returning();

      const p1Id = insertedPublishers[0].id;
      const p2Id = insertedPublishers[1].id;

      // 4. Seed Authors
      const insertedAuthors = await tx.insert(author).values([
        { firstName: 'George', lastName: 'Orwell', biography: 'English novelist, essayist, journalist and critic.' },
        { firstName: 'Jane', lastName: 'Austen', biography: 'English novelist known primarily for her six major novels.' },
        { firstName: 'J.R.R.', lastName: 'Tolkien', biography: 'English writer, poet, philologist, and academic, author of High Fantasy classics.' }
      ]).returning();

      const a1Id = insertedAuthors[0].id;
      const a2Id = insertedAuthors[1].id;
      const a3Id = insertedAuthors[2].id;

      // 5. Seed Categories
      const insertedCategories = await tx.insert(category).values([
        { name: 'Fiction' },
        { name: 'Science Fiction' },
        { name: 'Fantasy' },
        { name: 'History' }
      ]).returning();

      const c1Id = insertedCategories[0].id;
      const c2Id = insertedCategories[1].id;
      const c3Id = insertedCategories[2].id;

      // 6. Seed Books
      const insertedBooks = await tx.insert(book).values([
        { isbn: '9780141036144', title: '1984', edition: 1, publicationYear: 1949, publisherId: p1Id, description: 'Dystopian social science fiction novel.' },
        { isbn: '9780141439517', title: 'Pride and Prejudice', edition: 2, publicationYear: 1813, publisherId: p1Id, description: 'Classic romantic novel of manners.' },
        { isbn: '9780261103344', title: 'The Hobbit', edition: 1, publicationYear: 1937, publisherId: p2Id, description: 'Childrens fantasy novel and prelude to Lord of the Rings.' }
      ]).returning();

      const book1Id = insertedBooks[0].id;
      const book2Id = insertedBooks[1].id;
      const book3Id = insertedBooks[2].id;

      // 7. Seed Book_Authors relationships
      await tx.insert(bookAuthor).values([
        { bookId: book1Id, authorId: a1Id },
        { bookId: book2Id, authorId: a2Id },
        { bookId: book3Id, authorId: a3Id }
      ]);

      // 8. Seed Book_Categories relationships
      await tx.insert(bookCategory).values([
        { bookId: book1Id, categoryId: c2Id }, // Sci-Fi
        { bookId: book1Id, categoryId: c1Id }, // Fiction
        { bookId: book2Id, categoryId: c1Id }, // Fiction
        { bookId: book3Id, categoryId: c3Id }  // Fantasy
      ]);

      // 9. Seed Book Copies
      await tx.insert(bookCopy).values([
        { bookId: book1Id, branchId: b1Id, status: 'available', acquisitionDate: '2026-01-10' },
        { bookId: book1Id, branchId: b2Id, status: 'available', acquisitionDate: '2026-01-12' },
        { bookId: book2Id, branchId: b1Id, status: 'available', acquisitionDate: '2026-02-01' },
        { bookId: book3Id, branchId: b1Id, status: 'available', acquisitionDate: '2026-03-15' }
      ]);

      console.log('Database seeding completed successfully.');
    });
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}
