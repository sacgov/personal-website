---
title: Scaling WhatsApp and Campaigns at yellow.ai to a billion notifications
layout: post
---

## How yellow.ai scaled to a billion notifications on its campaign manager

Yellow.ai is Conversational CX Automation Platform. We provide chatbot solutions to enterprise clients.
We allow enterprises to configure the chatbots on WhatsApp using [WhatsApp For Business](https://developers.facebook.com/docs/whatsapp/business-management-api/using-the-api){:target="_blank"}.
The goal was to build a campaign management tool to manage the end users of the enterprises on WhatsApp, SMS, email by sending automated notifications.

### Initial Design

The system had to achieve the following specification for the [MVP](https://en.wikipedia.org/wiki/Minimum_viable_product){:target="_blank"}
- Allow customer to specify a cron time to run campaigns on a periodic basis
- Each campaign would run on a set of users on WhatsApp. The contact details would uploaded to our system by our enterprise customers
- Host the whatsapp [infrastructure](https://developers.facebook.com/docs/whatsapp/on-premises/get-started/installation){:target="_blank"} for each enterprise.



There were 5 components in our architecture. A scheduler, scheduler-worker, notification-worker, kafka as message queue, mysql as the datastore. The services are written in node.js.


- *Job* is a campaign to be executed at a specified cron interval. It can be in the following states
  - Pending : Waiting for its next execution time as specified in cron 
  - Scheduled : `Scheduler` has picked the job for processing
  - Running : The job is currently being run by the `scheduler-worker`
  - Completed : The job has finished execution
  - Paused : A job can be paused in between execution
- *Checkpoint* is a commit indentifier that is commited to MySQL at regular intervals to update progress of the job. This is also used for resuming paused jobs, or retrying failed jobs
- *Whatsapp Infratructure* refers to the deployment of whatsapp's docker on our cloud. This is provided by whatsapp and is connects to the actual whatsapp. Such a setup is necessary to maintain [E2E encryption](https://en.wikipedia.org/wiki/End-to-end_encryption){:target="_blank"}.
- *contact* is a whatsapp contact to send notification. A campaign might have millions of contacts that are uploaded as a csv by our customers.
- *report* is the status of a single notification. For whatsapp the status can be sent, delivered, read and failed. failure can happen for various reasons like invalid contact number or the contact blocking the business on whatsapp.

**Scheduler** : We store the campaign execution crons in MySQL. Each row includes the time to schedule the campaign and the required metadata to execute it. Scheduler would poll the MySQL in regular intervals and publish pending jobs it to a kafka queue `job-queue`. Jobs for which the *checkpoints* are not updated in a deadline of 10 mins are considered as failed and retried.

**Scheduler-worker** : Pick the job from the `job-queue`. Using the metadata from the campaign job, iterates and pushes a batch of 100 contacts to the kafka-queue `notification-queue`. We deployed 50 workers to run jobs in parallel. The *checkpoint* for every batch in MySQL jobs table.

**notification-worker**: Picks the notification to be sent from the kafka-queue `notification-queue` and send the notification to the whatsapp infrastructure we are hosting. It populates a *report* on sending a notification. It also listens to status updates from whatsapp to keep *reports* updated.

### Scaling Issue #1 : Adjusting to whatsapp rate limits
The product gained significant traction. **Million** notifications a day. Whatsapp has a  [rate limit](https://developers.facebook.com/docs/whatsapp/api/rate-limits/#capacity){:target="_blank"} of 50 Tps. Whatsapp has levels of infrastructure tiers allowing for higher or lower limits. Since our `scheduler-worker` enqueued to kafka at regular intervals of time, this was a problem. We were either too fast for some tiers or too slower than possible on certain tiers.

We decided to rely on [Bull](https://github.com/OptimalBits/bull){:target:"_blank"}. Bull is a fast, reliable, Redis-based queue for Node.It's focus is on stability and atomicity. It was fast enough for our operations. Moreover it had functionality to support concurrency based on redis locks and rate limiting. 

Our new design now discarded the common `notification-queue` and pushed the contacts to individual bull queues. We could now tune the currency and rate limit per campaign by setting these options on the individual bull quques related to each job. However this introduces a new dependency on Redis to our system. It ran quite well to certain scale.

### Scaling Issue #2. Unbounded Bull queues overwhelm Redis

When a *whatsapp infrastructure* goes down due to any reason, the notifications were pushed back into the bull queue to be retried after a certain delay, in our case 15 seconds. We would exponentially increase the delay in case of failed retries.
But the queue size would be become large enough and we ran into issues with rate limiting. Paraphrasing the [issue](https://github.com/OptimalBits/bull/issues/1941#issuecomment-799402453){:target:"_blank"} from github
>The rate limiter will "delay" the jobs that get limited , but when so many jobs are arriving at the same time it could happen that jobs that have already been rate limited gets rate limited again and that creates a loop that requires a lot of CPU on redis side

There was another nuance of the internal implementation of delayed jobs in bull that we had missed. This has been improved in the latest version of Bull but was an issue at that time.
 > Delayed tasks are initially stored ordered by epoch time amount in a Redis ZSET. Using time to next delayed task, there is a procedure scheduled with setTimeout() to move all tasks in batches of 1000 from delayed zset to usual queue (which is Redis LIST). So these jobs are also going through BRPOPLPUSH. The jobs are moved back to the waiting list in batches of 1k job ids. Then would be process like usual jobs thereafter. So if we have 50 instances of node processes pulling jobs off the queue, they'll all be doing somewhat redundant operations for managing delayed jobs.
 
We realised we needed some notion of backpressure to enqueue lesser notifications in each bull queue to restricted unbounded growth. Recall that we have a bull queue per campaign. We checked the size of the bull queue and skipped a batch if the count of tasks for the campaign was greater than a certain limit (500-2k) depending on the size of the campaign. We saw the redis usage reduce by a large margin once the sizes of bull queues were bounded. This had a side affect though, we were scheduling slowly now since we skip the batch some times and workers now take more time to finish the campaign.


### Scaling Issue #3. Maintaining of State of bull queues and parallel campaigns limit

For a campaign of 10k notifications, we pushed a batch of 100 every 5 seconds, the scheduler-worker took 100 iterations to finish this which is 500s or nearly ~8-9 minutes. In the case of back pressure we would skipping a few chances since the down stream queue is not cleared, this meant the worker would spend more time to finish enququeing the notifications.
On peak usage times we needed to run more than 50 campaigns which our model would not support or we ahvd to write code to scale it automatically. But the comepute was not the problem but our scheduling and sleep logic to wait was causing the bottleneck.
Workers sleeping and waiting for next iteration was wasted time. We mitigated this by using a Redis Zset with jobs as the member and epock timestamp of the next iteration as the score. We would use this as a priority queue from which the worker would pop. So the workers would not longer sleep. With the same 50 workers we were now doing 300-400 campaigns parallely per minute.
This also had a benefit of not startving the later campaigns when many are scheduled. All campaign would start but run slowly as we are not waiting for a job to finish before picking the next one but instead loop though parts of job by pushing the next execution details to Redis Zset
<!--Todo add more clarity here-->

Now since many campaigns run parallely compared to the 50 previously, alot of bull queues would be created. Each bull queue takes 2 connections to redis. Redis connections are not shared as bull relies on blocking commands for job picking. This results in an upper limit to number of bull quques we can create as we scale on a single redis.

### Scaling Issue #4. Can we have a single bull queue but still have rate-limits per job/campaign

Intead of maintaining rate limits on individual bull queues, we moved to enqueing differently sized batches from `scheduler-worker`. Consider the following instance. If we need a rate limit of 600/minute, we would enqueue a batch of 50 every 5 seconds and for a rate limit of 60/minute we could do 30 every 30 seconds. We could also give higher priority to certain campaigns by giving it higher score in the Redis Zset. This is only feasible to do now because workers are iterating through campaigns and waiting/sleep and are doing more active work continously and we have a priority quque of active campaigns as a Redis Zset.

Also maintaining the list of active quques and starting all of them on deployment was a management overhead. We now have a single bull queue while still having rate-limits per campaign. This was a significant milestone. We also have a upper limit on the size of this single bull queue so we do not run in to issue #2. 

*Scheduler* would now push to redis Zset `activeCampaigns` instead of kafka queue `job-queue` and kafka dependency from the system.


### Scaling Issue #5. Rate limits are great, but some times Whatsapp fails to keep up with the advertised limits.

consider the following scenario, the WhatsApp infrastructure that is normally to hand x Tps degrades to 0.6 tps because of one of various reasons like many end users are active on whatsapp chatting or a lot of media is being shared to the whatsapp business account. The rate limits are only indicative of the hard limits and in practice we hit the limit at 60-70 percent of advertised limit. We also saw an increased amoung of whatsapp infra failures because of overload.
So we needed **Adaptive rate limiting**.

There was also a curious case of multiple campaigns running on the same infrastructure and the limit needing to be distributed among the active campaigns.

Enter **AIMD**

[AIMD](https://en.wikipedia.org/wiki/Additive_increase/multiplicative_decrease){:target:"_blank"} additive-increase/multiplicative-decrease (AIMD) algorithm is a feedback control algorithm best known for its use in TCP congestion control. 

<!--todo make mathc look good-->

![AIMD](https://wikimedia.org/api/rest_v1/media/math/render/svg/55a5e0b0be92bbdfd774092e0da9a41e4450c607)


We detect congestion from the [API](https://developers.facebook.com/docs/whatsapp/api/stats/app){:target="_blank"} exposed by whatsapp. 

<!--todo add important data here inline at all places-->
When congestion is detected, we would penalize it by 50 percent and add 20 extra in each batch of 5 seconds. This reduces a lot infrastructure overloads. Also we were able to show timely alerts on whatsapp infrastucture degrading. We were also able to run at full efficiency as some for certain kind of messages we were able to exceed the advertised limits and face no congestion.
Also there was no need to configure any rate limits or infrastructure tiers in campaigns as we use adaptive rate limiting and not initial values needed to be set.
We were running at the highest efficiency we can as we progressive overload the rate and we fairly share the load between multiple campaigns as well with AIMD.
This meant that when we scale a whatsapp infrastructure we need not manual come and scale up the rate limits in campaigns or we sysncing the tiers every day in the night resulting in better experience for our customer.