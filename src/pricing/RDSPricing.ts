import { differenceInSeconds } from 'date-fns';
import { Pricing } from './Pricing';
import { RDSDimension } from '../dimension';
import { metrics, window } from '../config';
import { PricingResult } from '../types';

export class RDSPricing extends Pricing {
    private monthlyStoragePrice: number;

    private hourlyACUPrice: number;

    private iopsPrice: number;

    public async init(): Promise<RDSPricing> {
        const acuPricing = await this.pricingClient.getProducts({
            serviceCode: 'AmazonRDS',
            region: this.region,
            filters: [
                { field: 'productFamily', value: 'serverless' },
            ],
        });

        const iopsPricing = await this.pricingClient.getProducts({
            serviceCode: 'AmazonRDS',
            region: this.region,
            filters: [
                { field: 'productFamily', value: 'System Operation' },
                { field: 'group', value: 'Aurora I/O Operation' },
                { field: 'databaseEngine', value: 'any' },
            ],
        });

        const storagePricing = await this.pricingClient.getProducts({
            serviceCode: 'AmazonRDS',
            region: this.region,
            filters: [
                { field: 'productFamily', value: 'Database Storage' },
                { field: 'volumeType', value: 'General Purpose-Aurora' },
                { field: 'databaseEngine', value: 'any' },
            ],
        });

        this.monthlyStoragePrice = storagePricing[0] && storagePricing[0].pricePerUnit;
        this.hourlyACUPrice = acuPricing[0] && acuPricing[0].pricePerUnit;
        this.iopsPrice = iopsPricing[0] && iopsPricing[0].pricePerUnit;

        return this;
    }

    public calculateForDimension(dimension: RDSDimension): PricingResult {
        const ACUCost = (dimension.auroraCapacityUnits * this.hourlyACUPrice) / 60; // cost per minute
        const storageCost = (dimension.storedGiBs * this.monthlyStoragePrice) / (10 ** 9) / window.MONTHLY / 60; // cost per minute
        const iopsCost = dimension.ioRequests * this.iopsPrice / metrics.METRIC_WINDOW;
        const totalCost = ACUCost + storageCost + iopsCost;
        const costWindowSeconds = differenceInSeconds(dimension.end, dimension.start) / metrics.METRIC_WINDOW;

        return {
            currency: this.currency,
            estimatedMonthlyCharge: RDSPricing.getMonthlyEstimate(totalCost, costWindowSeconds),
            totalCostWindowSeconds: costWindowSeconds,
            totalCost,
            breakdown: {
                storageCharges: storageCost,
                iopsCharges: iopsCost,
                ACUCharges: ACUCost,
            },
        };
    }
}