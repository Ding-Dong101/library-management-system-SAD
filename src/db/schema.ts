import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  integer,
  varchar,
  date,
  pgEnum,
  decimal,
  boolean,
  timestamp,
  index,
  primaryKey
} from 'drizzle-orm/pg-core';

// Enums
export const copyStatusEnum = pgEnum('copy_status', ['available', 'loaned', 'reserved', 'lost']);
export const membershipTypeEnum = pgEnum('membership_type', ['regular', 'premium', 'staff']);
export const reservationStatusEnum = pgEnum('reservation_status', ['pending', 'fulfilled', 'cancelled', 'expired']);

// 1. Publisher
export const publisher = pgTable('publisher', {
  id: serial('publisher_id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  address: varchar('address', { length: 200 }),
  phone: varchar('phone', { length: 20 }),
});

// 2. Author
export const author = pgTable('author', {
  id: serial('author_id').primaryKey(),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }).notNull(),
  biography: text('biography'),
});

// 3. Book
export const book = pgTable('book', {
  id: serial('book_id').primaryKey(),
  isbn: varchar('isbn', { length: 13 }).notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  edition: integer('edition'),
  publicationYear: integer('publication_year'),
  publisherId: integer('publisher_id').references(() => publisher.id),
  description: text('description'),
});

// 4. Book_Author
export const bookAuthor = pgTable('book_author', {
  bookId: integer('book_id').notNull().references(() => book.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => author.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.bookId, table.authorId] })
]);

// 5. Category
export const category = pgTable('category', {
  id: serial('category_id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
});

// 6. Book_Category
export const bookCategory = pgTable('book_category', {
  bookId: integer('book_id').notNull().references(() => book.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => category.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.bookId, table.categoryId] })
]);

// 7. Library_Branch
export const libraryBranch = pgTable('library_branch', {
  id: serial('branch_id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  location: varchar('location', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 20 }),
});

// 8. Book_Copy
export const bookCopy = pgTable('book_copy', {
  id: serial('copy_id').primaryKey(),
  bookId: integer('book_id').notNull().references(() => book.id, { onDelete: 'cascade' }),
  branchId: integer('branch_id').notNull().references(() => libraryBranch.id),
  status: copyStatusEnum('status').default('available').notNull(),
  acquisitionDate: date('acquisition_date'),
}, (table) => [
  index('copy_book_branch_status_idx').on(table.bookId, table.branchId, table.status)
]);

// 9. Member
export const member = pgTable('member', {
  id: serial('member_id').primaryKey(),
  uid: varchar('uid', { length: 128 }).unique(), // Maps to Firebase Auth UID if connected
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }).notNull(),
  address: varchar('address', { length: 200 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 100 }).notNull().unique(),
  membershipDate: date('membership_date').defaultNow().notNull(),
  membershipType: membershipTypeEnum('membership_type').default('regular').notNull(),
});

// 10. Loan
export const loan = pgTable('loan', {
  id: serial('loan_id').primaryKey(),
  copyId: integer('copy_id').notNull().references(() => bookCopy.id),
  memberId: integer('member_id').notNull().references(() => member.id),
  loanDate: date('loan_date').defaultNow().notNull(),
  dueDate: date('due_date').notNull(),
  returnDate: date('return_date'),
}, (table) => [
  index('loan_member_return_idx').on(table.memberId, table.returnDate),
  index('loan_copy_loan_idx').on(table.copyId, table.loanDate)
]);

// 11. Fine
export const fine = pgTable('fine', {
  id: serial('fine_id').primaryKey(),
  loanId: integer('loan_id').notNull().unique().references(() => loan.id),
  amount: decimal('amount', { precision: 6, scale: 2 }).notNull(),
  paidStatus: boolean('paid_status').default(false).notNull(),
  issueDate: date('issue_date').defaultNow().notNull(),
}, (table) => [
  index('fine_loan_idx').on(table.loanId),
  index('fine_paid_status_idx').on(table.paidStatus)
]);

// 12. Reservation
export const reservation = pgTable('reservation', {
  id: serial('reservation_id').primaryKey(),
  bookId: integer('book_id').notNull().references(() => book.id, { onDelete: 'cascade' }),
  memberId: integer('member_id').notNull().references(() => member.id),
  branchId: integer('branch_id').notNull().references(() => libraryBranch.id),
  reservationDate: timestamp('reservation_date').defaultNow().notNull(),
  status: reservationStatusEnum('status').default('pending').notNull(),
  expirationDate: date('expiration_date').notNull(),
}, (table) => [
  index('res_book_status_date_idx').on(table.bookId, table.status, table.reservationDate)
]);

// 13. Staff
export const staff = pgTable('staff', {
  id: serial('staff_id').primaryKey(),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  branchId: integer('branch_id').notNull().references(() => libraryBranch.id),
  email: varchar('email', { length: 100 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
});

// Relationships
export const publisherRelations = relations(publisher, ({ many }) => ({
  books: many(book),
}));

export const authorRelations = relations(author, ({ many }) => ({
  books: many(bookAuthor),
}));

export const bookRelations = relations(book, ({ one, many }) => ({
  publisher: one(publisher, {
    fields: [book.publisherId],
    references: [publisher.id],
  }),
  authors: many(bookAuthor),
  categories: many(bookCategory),
  copies: many(bookCopy),
  reservations: many(reservation),
}));

export const bookAuthorRelations = relations(bookAuthor, ({ one }) => ({
  book: one(book, {
    fields: [bookAuthor.bookId],
    references: [book.id],
  }),
  author: one(author, {
    fields: [bookAuthor.authorId],
    references: [author.id],
  }),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  books: many(bookCategory),
}));

export const bookCategoryRelations = relations(bookCategory, ({ one }) => ({
  book: one(book, {
    fields: [bookCategory.bookId],
    references: [book.id],
  }),
  category: one(category, {
    fields: [bookCategory.categoryId],
    references: [category.id],
  }),
}));

export const libraryBranchRelations = relations(libraryBranch, ({ many }) => ({
  copies: many(bookCopy),
  staff: many(staff),
  reservations: many(reservation),
}));

export const bookCopyRelations = relations(bookCopy, ({ one, many }) => ({
  book: one(book, {
    fields: [bookCopy.bookId],
    references: [book.id],
  }),
  branch: one(libraryBranch, {
    fields: [bookCopy.branchId],
    references: [libraryBranch.id],
  }),
  loans: many(loan),
}));

export const memberRelations = relations(member, ({ many }) => ({
  loans: many(loan),
  reservations: many(reservation),
}));

export const loanRelations = relations(loan, ({ one }) => ({
  copy: one(bookCopy, {
    fields: [loan.copyId],
    references: [bookCopy.id],
  }),
  member: one(member, {
    fields: [loan.memberId],
    references: [member.id],
  }),
  fine: one(fine, {
    fields: [loan.id],
    references: [fine.loanId],
  }),
}));

export const fineRelations = relations(fine, ({ one }) => ({
  loan: one(loan, {
    fields: [fine.loanId],
    references: [loan.id],
  }),
}));

export const reservationRelations = relations(reservation, ({ one }) => ({
  book: one(book, {
    fields: [reservation.bookId],
    references: [book.id],
  }),
  member: one(member, {
    fields: [reservation.memberId],
    references: [member.id],
  }),
  branch: one(libraryBranch, {
    fields: [reservation.branchId],
    references: [libraryBranch.id],
  }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  branch: one(libraryBranch, {
    fields: [staff.branchId],
    references: [libraryBranch.id],
  }),
}));
