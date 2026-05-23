import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ApplyRiderInput,
  DeliveryJob,
  DeliveryJobStatus,
  Rider,
  RiderLocationInput,
  RiderOnline,
  RiderStatus,
  RiderVehicle,
} from '../../shared/types';
import { haversineKm } from '../local/local.service';

interface DbRider {
  id: string;
  userId: string;
  vehicle: string;
  status: string;
  online: string;
  lat: number | null;
  lng: number | null;
  totalDeliveries: number;
  totalEarningsCents: number;
  createdAt: string;
}

interface DbJob {
  id: string;
  orderId: string;
  riderId: string | null;
  status: string;
  pickupLat: number;
  pickupLng: number;
  pickupText: string;
  dropLat: number;
  dropLng: number;
  dropText: string;
  distanceKm: number;
  riderFeeCents: number;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  riderUserId?: string | null;
  riderName?: string | null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class RiderService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  async apply(userId: string, input: ApplyRiderInput): Promise<Rider> {
    const existing = await this.findByUser(userId);
    if (existing) return existing;
    const id = newId('rdr');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO riders (id, userId, vehicle, status, online)
       VALUES (?, ?, ?, 'ACTIVE', 'OFFLINE')`,
      id,
      userId,
      input.vehicle,
    );
    const created = await this.findByUser(userId);
    if (!created) throw new Error('Insert rider failed');
    return created;
  }

  async me(userId: string): Promise<Rider | null> {
    return this.findByUser(userId);
  }

  async ensureMe(userId: string): Promise<Rider> {
    const r = await this.findByUser(userId);
    if (!r) throw new NotFoundException('ยังไม่ได้สมัคร Rider');
    return r;
  }

  async updateLocation(userId: string, input: RiderLocationInput): Promise<Rider> {
    const rider = await this.ensureMe(userId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE riders
         SET lat = ?, lng = ?, online = COALESCE(?, online), updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      input.lat,
      input.lng,
      input.online ?? null,
      rider.id,
    );
    const fresh = await this.findByUser(userId);
    if (!fresh) throw new Error('Rider disappeared');
    return fresh;
  }

  // ---------------------------------------------------------------------------
  // Job lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Dispatch on payment success — create a REQUESTED DeliveryJob for an order
   * if it has a local store + drop address.
   */
  async createJobForOrder(input: {
    orderId: string;
    pickupLat: number;
    pickupLng: number;
    pickupText: string;
    dropLat: number;
    dropLng: number;
    dropText: string;
    perKmCents: number;
    baseDeliveryCents: number;
  }): Promise<DeliveryJob> {
    const distanceKm = haversineKm(
      input.pickupLat,
      input.pickupLng,
      input.dropLat,
      input.dropLng,
    );
    const distanceRounded = Math.round(distanceKm * 100) / 100;
    // Rider gets 80% of delivery cost (mock split — admin gets the rest)
    const totalDeliveryCents =
      input.baseDeliveryCents + Math.ceil(Math.max(0, distanceKm - 1)) * input.perKmCents;
    const riderFee = Math.floor(totalDeliveryCents * 0.8);

    // Idempotent: if a job already exists for this order, return it.
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM delivery_jobs WHERE orderId = ?`,
      input.orderId,
    )) as Array<{ id: string }>;
    if (existing.length > 0) {
      return this.getJobById(existing[0]!.id) as Promise<DeliveryJob>;
    }

    const id = newId('job');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO delivery_jobs
        (id, orderId, status, pickupLat, pickupLng, pickupText,
         dropLat, dropLng, dropText, distanceKm, riderFeeCents)
       VALUES (?, ?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.orderId,
      input.pickupLat,
      input.pickupLng,
      input.pickupText,
      input.dropLat,
      input.dropLng,
      input.dropText,
      distanceRounded,
      riderFee,
    );
    const job = await this.getJobById(id);
    if (!job) throw new Error('Job insert failed');
    return job;
  }

  /** Riders see open jobs (sorted by distance from their location). */
  async openJobs(userId: string, limit = 20): Promise<DeliveryJob[]> {
    const rider = await this.ensureMe(userId);
    if (rider.online === 'OFFLINE') return [];
    if (rider.lat == null || rider.lng == null) return [];

    const jobs = await this.listJobs({ status: 'REQUESTED', limit: 100 });
    const withDist = jobs.map((j) => ({
      job: j,
      distanceFromRider: haversineKm(rider.lat!, rider.lng!, j.pickupLat, j.pickupLng),
    }));
    withDist.sort((a, b) => a.distanceFromRider - b.distanceFromRider);
    return withDist.slice(0, limit).map((x) => x.job);
  }

  async myJobs(userId: string, status?: DeliveryJobStatus): Promise<DeliveryJob[]> {
    const rider = await this.ensureMe(userId);
    return this.listJobs({ riderId: rider.id, status, limit: 100 });
  }

  async accept(userId: string, jobId: string): Promise<DeliveryJob> {
    const rider = await this.ensureMe(userId);
    if (rider.status !== 'ACTIVE') {
      throw new ForbiddenException('Rider โปรไฟล์ยังไม่ ACTIVE');
    }
    const job = await this.getJobById(jobId);
    if (!job) throw new NotFoundException('ไม่พบงาน');
    if (job.status !== 'REQUESTED') {
      throw new BadRequestException(`งานนี้รับไม่ได้แล้ว (สถานะ=${job.status})`);
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE delivery_jobs
         SET riderId = ?, status = 'ASSIGNED', assignedAt = CURRENT_TIMESTAMP,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'REQUESTED'`,
      rider.id,
      jobId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE riders SET online = 'BUSY', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      rider.id,
    );
    const next = await this.getJobById(jobId);
    if (!next) throw new Error('Job disappeared');
    return next;
  }

  async pickup(userId: string, jobId: string): Promise<DeliveryJob> {
    const rider = await this.ensureMe(userId);
    const job = await this.getJobById(jobId);
    if (!job) throw new NotFoundException('ไม่พบงาน');
    if (job.riderId !== rider.id) throw new ForbiddenException('ไม่ใช่งานของคุณ');
    if (job.status !== 'ASSIGNED') {
      throw new BadRequestException(`สถานะไม่ถูกต้อง (=${job.status})`);
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE delivery_jobs
         SET status = 'PICKED_UP', pickedUpAt = CURRENT_TIMESTAMP,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      jobId,
    );
    return (await this.getJobById(jobId))!;
  }

  /**
   * Rider marks delivered.
   * Side effects:
   *  - order.status = DELIVERED (if currently SHIPPED/PAID/READY_TO_SHIP)
   *  - rider.totalDeliveries += 1, totalEarningsCents += fee, online = AVAILABLE
   *  - shipment row gets a DELIVERED event (best-effort)
   */
  async deliver(userId: string, jobId: string): Promise<DeliveryJob> {
    const rider = await this.ensureMe(userId);
    const job = await this.getJobById(jobId);
    if (!job) throw new NotFoundException('ไม่พบงาน');
    if (job.riderId !== rider.id) throw new ForbiddenException('ไม่ใช่งานของคุณ');
    if (job.status !== 'PICKED_UP') {
      throw new BadRequestException(`สถานะไม่ถูกต้อง (=${job.status})`);
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE delivery_jobs
         SET status = 'DELIVERED', deliveredAt = CURRENT_TIMESTAMP,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      jobId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE riders
         SET totalDeliveries = totalDeliveries + 1,
             totalEarningsCents = totalEarningsCents + ?,
             online = 'AVAILABLE',
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      job.riderFeeCents,
      rider.id,
    );
    // Best-effort: mark related order as DELIVERED (don't block on error)
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE orders SET status = 'DELIVERED', updatedAt = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN ('PAID','READY_TO_SHIP','SHIPPED')`,
        job.orderId,
      );
    } catch {
      // ignore
    }
    return (await this.getJobById(jobId))!;
  }

  async getJobByOrder(orderId: string): Promise<DeliveryJob | null> {
    const rows = await this.queryJobs(`WHERE dj.orderId = ?`, [orderId], 1);
    return rows[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async findByUser(userId: string): Promise<Rider | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, vehicle, status, online, lat, lng,
              totalDeliveries, totalEarningsCents, createdAt
         FROM riders WHERE userId = ?`,
      userId,
    )) as DbRider[];
    return rows[0] ? this.toRider(rows[0]) : null;
  }

  private async getJobById(id: string): Promise<DeliveryJob | null> {
    const rows = await this.queryJobs(`WHERE dj.id = ?`, [id], 1);
    return rows[0] ?? null;
  }

  private async listJobs(opts: {
    status?: string;
    riderId?: string;
    limit: number;
  }): Promise<DeliveryJob[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      conds.push(`dj.status = ?`);
      params.push(opts.status);
    }
    if (opts.riderId) {
      conds.push(`dj.riderId = ?`);
      params.push(opts.riderId);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    return this.queryJobs(where, params, opts.limit);
  }

  private async queryJobs(
    where: string,
    params: unknown[],
    limit: number,
  ): Promise<DeliveryJob[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT dj.id, dj.orderId, dj.riderId, dj.status,
              dj.pickupLat, dj.pickupLng, dj.pickupText,
              dj.dropLat, dj.dropLng, dj.dropText,
              dj.distanceKm, dj.riderFeeCents,
              dj.assignedAt, dj.pickedUpAt, dj.deliveredAt, dj.createdAt,
              r.userId AS riderUserId,
              u.name AS riderName
         FROM delivery_jobs dj
         LEFT JOIN riders r ON r.id = dj.riderId
         LEFT JOIN users u ON u.id = r.userId
         ${where}
         ORDER BY dj.createdAt DESC
         LIMIT ?`,
      ...params,
      limit,
    )) as DbJob[];
    return rows.map((r) => this.toJob(r));
  }

  private toRider(r: DbRider): Rider {
    return {
      id: r.id,
      userId: r.userId,
      vehicle: r.vehicle as RiderVehicle,
      status: r.status as RiderStatus,
      online: r.online as RiderOnline,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      totalDeliveries: Number(r.totalDeliveries),
      totalEarningsCents: Number(r.totalEarningsCents),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  private toJob(r: DbJob): DeliveryJob {
    return {
      id: r.id,
      orderId: r.orderId,
      riderId: r.riderId,
      riderName: r.riderName ?? null,
      status: r.status as DeliveryJobStatus,
      pickupLat: Number(r.pickupLat),
      pickupLng: Number(r.pickupLng),
      pickupText: r.pickupText,
      dropLat: Number(r.dropLat),
      dropLng: Number(r.dropLng),
      dropText: r.dropText,
      distanceKm: Number(r.distanceKm),
      riderFeeCents: Number(r.riderFeeCents),
      assignedAt: r.assignedAt ? new Date(r.assignedAt).toISOString() : null,
      pickedUpAt: r.pickedUpAt ? new Date(r.pickedUpAt).toISOString() : null,
      deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }
}
