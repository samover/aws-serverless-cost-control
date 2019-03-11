import { CloudwatchClient } from './CloudwatchClient';

export abstract class AWSClient<T> {
    protected client: any;

    protected clwClient: CloudwatchClient;

    public constructor(client: T, clwClient?: CloudwatchClient) {
        this.client = client;
        this.clwClient = clwClient;
    }
}
