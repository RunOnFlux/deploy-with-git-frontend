import { redactSecrets } from './core.js';
import { BLOCKS_PER_MONTH, PLANS } from '../../src/services/deployService.js';

const TXID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ALLOWED_RENEWAL_MONTHS = [1, 2, 3, 6, 12];
const MAX_CONFIRMATION_DRIFT_BLOCKS = 2_880;

export class PaymentService {
  constructor({ fetchImpl = fetch, paymentBridgeUrl, deploymentService, flux, appUrl = 'https://orbit.runonflux.com' }) {
    this.fetch = fetchImpl;
    this.paymentBridgeUrl = paymentBridgeUrl.replace(/\/$/, '');
    this.deploymentService = deploymentService;
    this.flux = flux;
    this.appOrigin = new URL(appUrl).origin;
  }

  async createStripeCheckout(session, { appName, txid, operation = 'registration' }) {
    if (!TXID_PATTERN.test(String(txid || ''))) throw new Error('A valid Flux registration transaction is required');
    if (!this.flux?.assertTransaction) throw new Error('Transaction ownership verification is unavailable');
    if (operation === 'update' || operation === 'renewal') {
      return this.createUpdateTransactionCheckout(session, { appName, txid, operation });
    }
    if (operation !== 'registration') throw new Error('Unsupported checkout operation');
    await this.flux.getOwnedSpec(session, appName);
    const spec = await this.flux.assertTransaction(session, { appName, txid, type: 'fluxappregister' });
    const price = await this.deploymentService.price(spec);
    if (!(Number(price?.usd) > 0) || !(Number(price?.flux) > 0)) {
      throw new Error('Authoritative checkout price must be positive');
    }
    const months = Number(spec.expire) / BLOCKS_PER_MONTH;
    if (![1, 3, 6, 12].includes(months)) throw new Error('Registered billing period is invalid');
    const app = spec.compose?.[0];
    const plan = PLANS.find((candidate) => candidate.id !== 'custom' && candidate.cpu === Number(app?.cpu) && candidate.ram === Number(app?.ram) && candidate.hdd === Number(app?.hdd));
    return this.sendCheckout(session, { appName, txid, price, name: plan?.id || 'custom', months, operation: 'registration' });
  }

  async createUpdateTransactionCheckout(session, { appName, txid, operation }) {
    if (!this.flux?.assertUpdateTransactionContext) throw new Error('Update transaction ownership verification is unavailable');
    const context = await this.flux.assertUpdateTransactionContext(session, { appName, txid });
    const previousExpire = Number(context.previousSpecification?.expire);
    const targetExpire = Number(context.specification?.expire);
    if (!Number.isFinite(previousExpire) || !Number.isFinite(targetExpire)) {
      throw new Error('Flux update expiry history is unavailable');
    }
    const remainingAtUpdate = Math.max(0, context.previousHeight + previousExpire - context.targetHeight);
    const extensionBlocks = targetExpire - remainingAtUpdate;
    const price = await this.deploymentService.price(context.specification);
    if (!(Number(price?.usd) > 0) || !(Number(price?.flux) > 0)) {
      throw new Error('Authoritative checkout price must be positive');
    }
    if (operation === 'update') {
      if (Math.abs(extensionBlocks) > MAX_CONFIRMATION_DRIFT_BLOCKS) {
        throw new Error('Flux transaction is a renewal, not a maintenance update');
      }
      return this.sendCheckout(session, { appName, txid, price, name: 'update', months: 1, operation: 'update' });
    }
    const extensionMonths = ALLOWED_RENEWAL_MONTHS.find((months) =>
      Math.abs(extensionBlocks - (months * BLOCKS_PER_MONTH)) <= MAX_CONFIRMATION_DRIFT_BLOCKS);
    if (!extensionMonths) throw new Error('Authoritative renewal period could not be derived');
    return this.createRenewalCheckout(session, { appName, txid, extensionMonths, price });
  }

  async createRegistrationCheckout(session, { appName, txid, price, planId, months }) {
    if (!TXID_PATTERN.test(String(txid || ''))) throw new Error('A valid Flux registration transaction is required');
    if (!(Number(price?.usd) > 0) || !(Number(price?.flux) > 0)) throw new Error('Authoritative checkout price must be positive');
    return this.sendCheckout(session, { appName, txid, price, name: planId, months, operation: 'registration' });
  }

  async sendCheckout(session, { appName, txid, price, name, months, operation }) {
    const subscription = months > 1;
    const endpoint = subscription ? '/api/v1/stripe/subscription/create' : '/api/v1/stripe/checkout/create';
    const response = await this.fetch(`${this.paymentBridgeUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `${session.firebaseUid || session.zelid}:${operation}:${appName}:${txid}`,
      },
      body: JSON.stringify({
        zelid: session.zelid, signature: session.signature, loginPhrase: session.loginPhrase,
        details: {
          name, description: `Orbit ${operation}: ${appName}`, hash: txid,
          price: Number(Number(price.usd).toFixed(2)), productName: appName,
          ...(subscription ? { period: months } : {}),
          success_url: `${this.appOrigin}/successcheckout`, cancel_url: this.appOrigin,
          kpi: { origin: 'Orbit', marketplace: true, [operation]: true, mcp: true },
        },
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.status === 'error' || typeof body?.data !== 'string') throw new Error('Stripe checkout could not be created');
    const checkout = new URL(body.data);
    if (checkout.protocol !== 'https:') throw new Error('Payment bridge returned an unsafe checkout URL');
    return redactSecrets({ checkoutUrl: checkout.toString(), appName, txid, price, subscription });
  }

  async createRenewalCheckout(session, { appName, txid, extensionMonths, price }) {
    if (!TXID_PATTERN.test(String(txid || ''))) throw new Error('A valid Flux update transaction is required');
    if (!ALLOWED_RENEWAL_MONTHS.includes(extensionMonths)) throw new Error('Unsupported renewal period');
    if (!(Number(price?.usd) > 0) || !(Number(price?.flux) > 0)) {
      throw new Error('Authoritative renewal price must be positive');
    }
    const subscription = extensionMonths > 1;
    const endpoint = subscription ? '/api/v1/stripe/subscription/create' : '/api/v1/stripe/checkout/create';
    const response = await this.fetch(`${this.paymentBridgeUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `${session.firebaseUid || session.zelid}:renewal:${appName}:${txid}`,
      },
      body: JSON.stringify({
        zelid: session.zelid,
        signature: session.signature,
        loginPhrase: session.loginPhrase,
        details: {
          name: 'renewal',
          description: `Orbit renewal: ${appName}`,
          hash: txid,
          price: Number(Number(price.usd).toFixed(2)),
          productName: appName,
          ...(subscription ? { period: extensionMonths } : {}),
          success_url: `${this.appOrigin}/successcheckout`,
          cancel_url: this.appOrigin,
          kpi: { origin: 'Orbit', marketplace: true, renewal: true, mcp: true },
        },
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.status === 'error' || typeof body?.data !== 'string') {
      throw new Error('Stripe renewal checkout could not be created');
    }
    const checkout = new URL(body.data);
    if (checkout.protocol !== 'https:') throw new Error('Payment bridge returned an unsafe checkout URL');
    return redactSecrets({ checkoutUrl: checkout.toString(), appName, txid, price, subscription });
  }

  async createUpdateCheckout(session, { appName, txid, price }) {
    if (!TXID_PATTERN.test(String(txid || ''))) throw new Error('A valid Flux update transaction is required');
    if (!(Number(price?.usd) > 0) || !(Number(price?.flux) > 0)) throw new Error('Authoritative update price must be positive');
    return this.sendCheckout(session, { appName, txid, price, name: 'update', months: 1, operation: 'update' });
  }
}
