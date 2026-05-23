import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Carrier,
  CarrierKind,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
  ShipOrderInput,
  ShippingQuote,
  ShippingQuoteRequest,
} from '../../shared/types';

interface DbCarrier {
  id: string;
  code: string;
  name: string;
  kind: string;
  logoUrl: string | null;
  baseRateCents: number;
  perKgCents: number;
  etaText: string | null;
  active: number; // SQLite boolean
}

interface DbShipment {
  id: string;
  orderId: string;
  carrierId: string;
  trackingNo: string | null;
  labelUrl: string | null;
  costCents: number;
  status: string;
  events: string;
  createdAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCarriers(): Promise<Carrier[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, code, name, kind, logoUrl, baseRateCents, perKgCents, etaText, active FROM carriers WHERE active = 1 ORDER BY kind, baseRateCents ASC`,
    )) as DbCarrier[];
    return rows.map((r) => this.toCarrier(r));
  }

  async quote(input: ShippingQuoteRequest): Promise<ShippingQuote> {
    const c = await this.findCarrierByCode(input.carrierCode);
    const weightKg = Math.max(1, Math.ceil(input.weightGrams / 1000));
    // free shipping over ฿1,000 for parcel carriers, except express
    const freeThreshold = c.kind === 'PARCEL' ? 100000 : Infinity;
    const eligibleFree = input.subtotalCents >= freeThreshold;
    const cost = eligibleFree
      ? 0
      : c.baseRateCents + (weightKg - 1) * c.perKgCents;
    return {
      carrierCode: c.code,
      carrierName: c.name,
      etaText: c.etaText,
      costCents: cost,
    };
  }

  async quoteByCode(carrierCode: string, subtotalCents: number): Promise<ShippingQuote> {
    return this.quote({ carrierCode, subtotalCents, weightGrams: 1000 });
  }

  /** Called from OrderService when merchant marks shipped. Idempotent (upsert). */
  async createOrUpdateShipment(orderId: string, input: ShipOrderInput): Promise<Shipment> {
    const carrier = await this.findCarrierByCode(input.carrierCode);

    const orderRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shippingCents FROM orders WHERE id = ?`,
      orderId,
    )) as Array<{ id: string; shippingCents: number }>;
    const orderRow = orderRows[0];
    if (!orderRow) throw new NotFoundException('Order not found');

    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id, events FROM shipments WHERE orderId = ?`,
      orderId,
    )) as Array<{ id: string; events: string }>;
    const existingRow = existing[0];

    const event: ShipmentEvent = {
      status: 'PICKED_UP',
      description: 'พัสดุถูกรับเข้าโกดังของผู้ขนส่ง',
      at: new Date().toISOString(),
    };

    if (!existingRow) {
      const id = newId('shp');
      const events: ShipmentEvent[] = [
        {
          status: 'LABEL_CREATED',
          description: 'สร้างใบนำส่งแล้ว',
          at: new Date().toISOString(),
        },
        event,
      ];
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO shipments (id, orderId, carrierId, trackingNo, costCents, status, events)
         VALUES (?, ?, ?, ?, ?, 'PICKED_UP', ?)`,
        id,
        orderId,
        carrier.id,
        input.trackingNo,
        orderRow.shippingCents,
        JSON.stringify(events),
      );
    } else {
      const events: ShipmentEvent[] = JSON.parse(existingRow.events || '[]');
      events.push(event);
      await this.prisma.$executeRawUnsafe(
        `UPDATE shipments SET carrierId = ?, trackingNo = ?, status = 'PICKED_UP', events = ?, updatedAt = CURRENT_TIMESTAMP WHERE orderId = ?`,
        carrier.id,
        input.trackingNo,
        JSON.stringify(events),
        orderId,
      );
    }

    return this.getShipment(orderId);
  }

  async getShipment(orderId: string): Promise<Shipment> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT shipments.id, shipments.orderId, shipments.carrierId, shipments.trackingNo,
              shipments.labelUrl, shipments.costCents, shipments.status, shipments.events,
              shipments.createdAt,
              carriers.code AS code, carriers.name AS name
         FROM shipments
         INNER JOIN carriers ON shipments.carrierId = carriers.id
         WHERE shipments.orderId = ?`,
      orderId,
    )) as Array<DbShipment & { code: string; name: string }>;
    const r = rows[0];
    if (!r) throw new NotFoundException('Shipment not found');
    return {
      id: r.id,
      orderId: r.orderId,
      carrierId: r.carrierId,
      carrierCode: r.code,
      carrierName: r.name,
      trackingNo: r.trackingNo,
      labelUrl: r.labelUrl,
      costCents: Number(r.costCents),
      status: r.status as ShipmentStatus,
      events: (JSON.parse(r.events || '[]') as ShipmentEvent[]).map((e) => ({
        ...e,
        status: e.status,
      })),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  /** Mock: progress shipment to next stage (dev only). */
  async advanceMock(orderId: string, customerId: string): Promise<Shipment> {
    const orderRows = (await this.prisma.$queryRawUnsafe(
      `SELECT customerId FROM orders WHERE id = ?`,
      orderId,
    )) as Array<{ customerId: string }>;
    const orderRow = orderRows[0];
    if (!orderRow) throw new NotFoundException('Order not found');
    if (orderRow.customerId !== customerId)
      throw new ForbiddenException('Not your order');

    const shipment = await this.getShipment(orderId);
    const order: ShipmentStatus[] = [
      'LABEL_CREATED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];
    const idx = order.indexOf(shipment.status);
    if (idx === -1 || idx >= order.length - 1) {
      throw new BadRequestException('Already at final stage');
    }
    const next = order[idx + 1]!;
    const events = [
      ...shipment.events,
      { status: next, description: this.statusText(next), at: new Date().toISOString() },
    ];
    await this.prisma.$executeRawUnsafe(
      `UPDATE shipments SET status = ?, events = ?, updatedAt = CURRENT_TIMESTAMP WHERE orderId = ?`,
      next,
      JSON.stringify(events),
      orderId,
    );
    return this.getShipment(orderId);
  }

  private statusText(s: ShipmentStatus): string {
    switch (s) {
      case 'LABEL_CREATED':
        return 'สร้างใบนำส่งแล้ว';
      case 'PICKED_UP':
        return 'พัสดุถูกรับเข้าโกดัง';
      case 'IN_TRANSIT':
        return 'อยู่ระหว่างขนส่ง';
      case 'OUT_FOR_DELIVERY':
        return 'พนักงานกำลังนำส่ง';
      case 'DELIVERED':
        return 'จัดส่งสำเร็จ';
      case 'FAILED':
        return 'จัดส่งไม่สำเร็จ';
      case 'RETURNED':
        return 'ส่งกลับต้นทาง';
    }
  }

  private async findCarrierByCode(code: string): Promise<Carrier> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, code, name, kind, logoUrl, baseRateCents, perKgCents, etaText, active FROM carriers WHERE code = ? AND active = 1`,
      code,
    )) as DbCarrier[];
    const first = rows[0];
    if (!first) throw new BadRequestException(`Carrier not found: ${code}`);
    return this.toCarrier(first);
  }

  private toCarrier(r: DbCarrier): Carrier {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind as CarrierKind,
      logoUrl: r.logoUrl,
      baseRateCents: Number(r.baseRateCents),
      perKgCents: Number(r.perKgCents),
      etaText: r.etaText,
      active: Boolean(r.active),
    };
  }
}
