import { differenceInMinutes, differenceInSeconds } from 'date-fns';
import { window } from '../config';
import { RDSDimension } from '../dimension';
import { PricingResult, ProductPricing } from '../types';
import { Pricing } from './Pricing';

const ONE_MILLION = 10 ** 6;

export class RDSPricing extends Pricing {
    private _monthlyStoragePrice: number;
    private _hourlyACUPrice: number;
    private _iopsPrice: number;

    public async init(): Promise<RDSPricing> {
        const acuPricing: ProductPricing[] = await this.pricingClient.getProducts({
            filters: [
                { field: 'productFamily', value: 'serverless' },
            ],
            region: this.region,
            serviceCode: 'AmazonRDS',
        });

        const iopsPricing: ProductPricing[] = await this.pricingClient.getProducts({
            filters: [
                { field: 'productFamily', value: 'System Operation' },
                { field: 'group', value: 'Aurora I/O Operation' },
                { field: 'databaseEngine', value: 'any' },
            ],
            region: this.region,
            serviceCode: 'AmazonRDS',
        });

        const storagePricing: ProductPricing[] = await this.pricingClient.getProducts({
            filters: [
                { field: 'productFamily', value: 'Database Storage' },
                { field: 'volumeType', value: 'General Purpose-Aurora' },
                { field: 'databaseEngine', value: 'any' },
            ],
            region: this.region,
            serviceCode: 'AmazonRDS',
        });

        if (storagePricing) {
            this._pricing = [...this._pricing, ...storagePricing];
            this._monthlyStoragePrice = this.getPricePerUnit('GB-Mo');
        }
        if (acuPricing) {
            this._pricing = [...this._pricing, ...acuPricing];
            this._hourlyACUPrice = this.getPricePerUnit('ACU-Hr');
        }
        if (iopsPricing) {
            this._pricing = [...this._pricing, ...iopsPricing];
            this._iopsPrice = this.getPricePerUnit('IOs');
        }

        return this;
    }

    public calculateForDimension(dimension: RDSDimension): PricingResult {
        // by default, cost window is one minute and metric window 5 minutes
        const metricWindowMinutes = differenceInMinutes(dimension.end, dimension.start);
        const costWindowSeconds = differenceInSeconds(dimension.end, dimension.start) / metricWindowMinutes;

        const ACUCost = (dimension.auroraCapacityUnits * this._hourlyACUPrice) / 60; // cost per minute
        const storageCost = (dimension.storedGiBs * this._monthlyStoragePrice) / window.MONTHLY / 60; // cost per minute
        const iopsCost = dimension.ioRequests * this._iopsPrice / ONE_MILLION / metricWindowMinutes;
        const totalCost = ACUCost + storageCost + iopsCost;

        return {
            breakdown: {
                ACUCharges: ACUCost,
                iopsCharges: iopsCost,
                storageCharges: storageCost,
            },
            currency: this.currency,
            estimatedMonthlyCharge: RDSPricing.getMonthlyEstimate(totalCost, costWindowSeconds),
            totalCost,
            totalCostWindowSeconds: costWindowSeconds,
        };
    }

    public get monthlyStoragePrice(): number {
        return this._monthlyStoragePrice;
    }

    public get hourlyACUPrice(): number {
        return this._hourlyACUPrice;
    }

    public get iopsPrice(): number {
        return this._iopsPrice;
    }
}
