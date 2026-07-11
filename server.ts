import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import * as dbServices from './src/services/dbServices.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Automatic Database Seed on boot
  await dbServices.seedDatabaseIfEmpty();

  // -------------------------------------------------------------
  // MASTER DATA / METADATA ROUTERS
  // -------------------------------------------------------------
  app.get('/api/branches', async (req, res) => {
    try {
      const data = await dbServices.getAllBranches();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/categories', async (req, res) => {
    try {
      const data = await dbServices.getAllCategories();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/authors', async (req, res) => {
    try {
      const data = await dbServices.getAllAuthors();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/publishers', async (req, res) => {
    try {
      const data = await dbServices.getAllPublishers();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // AUTH / USER SYNCHRONIZATION
  // -------------------------------------------------------------
  // Link or create user during Google Login
  app.post('/api/auth/sync-member', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Try searching for member by UID
      let memberProfile = await dbServices.getMemberProfileByUid(user.uid);
      
      // If not found, try by Email
      if (!memberProfile && user.email) {
        memberProfile = await dbServices.getMemberProfileByEmail(user.email);
        // Link UID if member already existed but wasn't linked
        if (memberProfile) {
          await dbServices.updateMember(memberProfile.id, {
            // Update mapping inside database
          });
          // We can link UID to existing member
          await dbServices.updateMember(memberProfile.id, {}).then(async () => {
            // Re-fetch to confirm link
            await dbServices.registerMember({
              firstName: user.name?.split(' ')[0] || 'Member',
              lastName: user.name?.split(' ').slice(1).join(' ') || 'User',
              email: user.email || '',
              uid: user.uid,
            });
          }).catch(() => {});
          memberProfile = await dbServices.getMemberProfileByUid(user.uid);
        }
      }

      // If still not found, automatically register a new member
      if (!memberProfile && user.email) {
        const parts = (user.name || 'Library Member').split(' ');
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || 'User';

        await dbServices.registerMember({
          firstName,
          lastName,
          email: user.email,
          uid: user.uid,
          membershipType: 'regular',
        });
        memberProfile = await dbServices.getMemberProfileByUid(user.uid);
      }

      res.json(memberProfile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/staff-login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const staffMember = await dbServices.authenticateStaff(email, password);
      res.json(staffMember);
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // MEMBER ROUTERS
  // -------------------------------------------------------------
  app.get('/api/members', async (req, res) => {
    try {
      const members = await dbServices.getAllMembers();
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/members', async (req, res) => {
    try {
      const newMember = await dbServices.registerMember(req.body);
      res.status(211).json(newMember);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/members/:id', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id, 10);
      const profile = await dbServices.getMemberProfile(memberId);
      res.json(profile);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.put('/api/members/:id', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id, 10);
      const updated = await dbServices.updateMember(memberId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/members/:id', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id, 10);
      await dbServices.deactivateOrDeleteMember(memberId);
      res.json({ success: true, message: 'Member deleted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/members/:id/loans', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id, 10);
      const loans = await dbServices.getMemberLoans(memberId);
      res.json(loans);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/members/:id/reservations', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id, 10);
      const reservations = await dbServices.getMemberReservations(memberId);
      res.json(reservations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/members/:id/fines', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id, 10);
      const fines = await dbServices.getMemberFines(memberId);
      res.json(fines);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // CATALOG ROUTERS
  // -------------------------------------------------------------
  app.get('/api/books', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const books = await dbServices.searchBooks(q, limit, offset);
      res.json(books);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/books', async (req, res) => {
    try {
      const newBook = await dbServices.addBook(req.body);
      res.status(211).json(newBook);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/books/:id', async (req, res) => {
    try {
      const bookId = parseInt(req.params.id, 10);
      await dbServices.deleteBook(bookId);
      res.json({ success: true, message: 'Book deleted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // INVENTORY ROUTERS
  // -------------------------------------------------------------
  app.post('/api/books/copies', async (req, res) => {
    try {
      const copy = await dbServices.addBookCopy(req.body);
      res.status(211).json(copy);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/books/copies/detail', async (req, res) => {
    try {
      const copies = await dbServices.getBookCopiesDetail();
      res.json(copies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/books/copies/:id/status', async (req, res) => {
    try {
      const copyId = parseInt(req.params.id, 10);
      const { status } = req.body;
      const updated = await dbServices.updateCopyStatus(copyId, status);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/books/copies/:id/transfer', async (req, res) => {
    try {
      const copyId = parseInt(req.params.id, 10);
      const { targetBranchId } = req.body;
      const updated = await dbServices.transferCopy(copyId, parseInt(targetBranchId, 10));
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // CIRCULATION ENGINE ROUTERS
  // -------------------------------------------------------------
  app.post('/api/loans', async (req, res) => {
    try {
      const { memberId, copyId, dueDate } = req.body;
      if (!memberId || !copyId) {
        return res.status(400).json({ error: 'memberId and copyId are required' });
      }
      const newLoan = await dbServices.loanBook(parseInt(memberId, 10), parseInt(copyId, 10), dueDate);
      res.status(211).json(newLoan);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/loans/return', async (req, res) => {
    try {
      const { copyId } = req.body;
      if (!copyId) {
        return res.status(400).json({ error: 'copyId is required' });
      }
      const returnResult = await dbServices.returnBook(parseInt(copyId, 10));
      res.json(returnResult);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/loans/:id/renew', async (req, res) => {
    try {
      const loanId = parseInt(req.params.id, 10);
      const renewed = await dbServices.renewLoan(loanId);
      res.json(renewed);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // RESERVATION ROUTERS
  // -------------------------------------------------------------
  app.post('/api/reservations', async (req, res) => {
    try {
      const { bookId, memberId, branchId } = req.body;
      if (!bookId || !memberId || !branchId) {
        return res.status(400).json({ error: 'bookId, memberId and branchId are required' });
      }
      const reservationCreated = await dbServices.placeReservation({
        bookId: parseInt(bookId, 10),
        memberId: parseInt(memberId, 10),
        branchId: parseInt(branchId, 10),
      });
      res.status(211).json(reservationCreated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/reservations/expire', async (req, res) => {
    try {
      const expiredCount = await dbServices.expireOldReservations();
      res.json(expiredCount);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // FINE / PAYMENT ROUTERS
  // -------------------------------------------------------------
  app.put('/api/fines/:id/pay', async (req, res) => {
    try {
      const fineId = parseInt(req.params.id, 10);
      const updated = await dbServices.payFine(fineId);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/fines/:id/waive', async (req, res) => {
    try {
      const fineId = parseInt(req.params.id, 10);
      const updated = await dbServices.waiveFine(fineId);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // STAFF & REPORTS ROUTERS
  // -------------------------------------------------------------
  app.post('/api/staff', async (req, res) => {
    try {
      const { firstName, lastName, role, branchId, email, passwordRaw } = req.body;
      if (!firstName || !lastName || !role || !branchId || !email || !passwordRaw) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      const newStaff = await dbServices.addStaff({
        firstName,
        lastName,
        role,
        branchId: parseInt(branchId, 10),
        email,
        passwordRaw,
      });
      res.status(211).json(newStaff);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/reports/branch', async (req, res) => {
    try {
      const reports = await dbServices.getBranchReports();
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // -------------------------------------------------------------
  // VITE DEV / PRODUCTION MIDDLEWARE
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
