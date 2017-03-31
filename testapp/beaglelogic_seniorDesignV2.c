/** * beaglelogictestapp.c * * Copyright (C) 2014 Kumar Abhishek * * This program is
free software; you can redistribute it and/or modify * it under the terms of the GNU
General Public License version 2 as * published by the Free Software Foundation. * *
8Mhz sample rate 16 bit samples */

#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/poll.h>
#include <sys/errno.h>
#include <sys/mman.h>
#include <sys/time.h>
#include <pthread.h>
#include <semaphore.h>
#include <time.h>
#include <unistd.h>
#include "seniorDesign/seniorDesignLib.h"
#include "libbeaglelogic.h"

int bfd, i;

/* Globals to Keep Track Of */
int pub_signal = 0;
int transmit = 1;
uint32_t forwardCount[5] = {0};
uint32_t backwardCount[5] = {0};
uint32_t errorCount[5] = {0};
uint32_t risingEdgeCounts[10] = {0};
uint32_t LastRisingEdgeTime[10] = {0};
uint32_t clockValue = 0;
uint32_t event = 9999;
uint8_t *buf,*bl_mem;
pthread_t MQTT_t;
sem_t MQTT_mutex;

/* For testing nonblocking IO */
#define NONBLOCK

/* for prover stroke */
#define proverStart 0b00000010
#define proverEnd   0b00000001
#define proverMask  0b00000011

/* Size of buffer */
#define bufSZ 4*1000*1000

/* Returns time difference in microseconds */
static uint64_t timediff(struct timespec *tv1, struct timespec *tv2)
{
	return ((((uint64_t)(tv2->tv_sec - tv1->tv_sec) * 1000000000) +
		(tv2->tv_nsec - tv1->tv_nsec)) / 1000);
}

/* Handles SIGINT */
void exithandler(int x)
{
	if (buf)
		free(buf);

	printf("sigint caught\n");
	fflush(stdout);
	beaglelogic_close(bfd);

	exit(-1);
}

/* Handles SIGSEGV */
void segfaulthandler(int x)
{
	printf("segfault caught at i = %X\n", i);

	fflush(stdout);
	beaglelogic_close(bfd);

	if (buf)
		free(buf);

	exit(-1);
}

/* Handles itimer */
void timer_handler(int signum) {
	/* Set Flag */
	pub_signal = 1;
}

int main(int argc, char **argv)
{
	int cnt1;
	int stopper = 0;
	size_t sz, sz_to_read, cnt;

	/*buffer for read*/
	char buffer[4 * 1000 * 1000] = {0};
	struct timespec t1, t2, t3, t4;
	struct pollfd pollfd;
	struct sigaction sa;
	struct itimerval timer;
	MQTT_Package package_t;

	/*only for testing state machine*/
	char stateTestBuffer[40] = {0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0,0,8,0,0};

	/* Init Sempahore */
	sem_init(&MQTT_mutex, 0, 0);


	printf("BeagleLogic test application\n");

	/* Open BeagleLogic */
	clock_gettime(CLOCK_MONOTONIC, &t1);
#if defined(NONBLOCK)
	bfd = beaglelogic_open_nonblock();
#else
	bfd = beaglelogic_open();
#endif
	clock_gettime(CLOCK_MONOTONIC, &t2);

	if (bfd == -1) {
		printf("BeagleLogic open failed! \n");
		return -1;
	}

	printf("BeagleLogic opened successfully in %jd us\n",
		timediff(&t1, &t2));

	/* Memory map the file */
	bl_mem = beaglelogic_mmap(bfd);

	/* Configure the poll descriptor */
	pollfd.fd = bfd;
	pollfd.events = POLLIN | POLLRDNORM;

	/* Register signal handlers */
	signal(SIGINT, exithandler);
	signal(SIGSEGV, segfaulthandler);

	/* Install timer handler */
	memset(&sa, 0, sizeof(sa));
	sa.sa_handler = &timer_handler;
	sigaction(SIGVTALRM, &sa, NULL);

	/* Configure timer to expire after .5 sec */
	timer.it_value.tv_sec = 0;
	timer.it_value.tv_usec = 500000;
	/* Create the interval with the same time */
	timer.it_interval.tv_sec = 0;
	timer.it_interval.tv_usec = 500000;
	/* Start a .5 timer that increase the MQTT_mutex semaphore */
	setitimer(ITIMER_VIRTUAL, &timer, NULL);


	/* Configure buffer size - we need a minimum of 32 MB */
	beaglelogic_get_buffersize(bfd, &sz_to_read);
	if (sz_to_read < 128 * 1024 * 1024) {
		beaglelogic_set_buffersize(bfd, sz_to_read = 128 * 1024 * 1024);
		beaglelogic_get_buffersize(bfd, &sz_to_read);
	}
	buf = calloc(sz_to_read / 128, 128);
	memset(buf, 0xFF, sz_to_read);
	printf("Buffer size = %d MB \n", sz_to_read / (1024 * 1024));

	/* Configure capture settings */
	clock_gettime(CLOCK_MONOTONIC, &t1);
	beaglelogic_set_samplerate(bfd, 8 * 1000 * 1000);
	beaglelogic_set_sampleunit(bfd, BL_SAMPLEUNIT_16_BITS);
	beaglelogic_set_triggerflags(bfd, BL_TRIGGERFLAGS_CONTINUOUS);
	clock_gettime(CLOCK_MONOTONIC, &t2);
	printf("Configured in %jd us\n", timediff(&t1, &t2));

	/* All set, start a capture */
	beaglelogic_start(bfd);

	/* Spawn MQTT thread */
	package_t.bfd_cpy = bfd;
	package_t.pollfd = pollfd;
	package_t.MQTT_mutex = &MQTT_mutex;
	//if (start_MQTT_t(&package_t, MQTT_t)) {
	//	return 1;
	//}

	clock_gettime(CLOCK_MONOTONIC, &t1);
	cnt = 0;
	for (i = 0; i < 10; i++) {

		/* Configure counters */
		cnt1 = 0;

#if defined(NONBLOCK)
		poll(&pollfd, 1, 500);
		int i=0;
		int changes = 0;
		clock_gettime(CLOCK_MONOTONIC, &t3);

		while (i==0) {
			/*Start a timer for Debug */
			//clock_gettime(CLOCK_MONOTONIC, &t3);
			//wait until file is read ?

			//commented out for state machine testing
			//while(!pollfd.revents){};
			//sz = read(bfd, buffer, bufSZ);

			//changed for testing state machine only
			/*Check For bit changes*/
			for (i = 2; i < 40; i+=2) {

				//printf("made it to for loop\n");
				/*Debug*/
				//printf("%2x vs %2x and %2x vs %2x\n", stateTestBuffer[i], stateTestBuffer[i-2],stateTestBuffer[i-1],stateTestBuffer[i+1]);

				clockValue++;
				if (stateTestBuffer[i] != stateTestBuffer[i-2] || stateTestBuffer[i + 1] != stateTestBuffer[i-1]){
					changes++;
					printf("%2x %2x %d this is i %d\n", stateTestBuffer[i], stateTestBuffer[i+1], changes,i);
					changeState((int) stateTestBuffer[i], (int) stateTestBuffer[i + 1]);

				}
				/*
				if (pub_signal){

				//	event = 0;
				//	MQTT_queueData(&package_t);
				}
				else if(buffer[i+1] & proverMask == proverStart){

				//	event = 1;
				//	MQTT_queueData(&package_t);
				}
				else if(buffer[i] & proverMask == proverEnd){

				//	event = 2;
				//	MQTT_queueData(&package_t);
				}
				*/
				//clear out for next run
				buffer[i-2] = 0;
				buffer[i-1] = 0;
			}

			/* Debug timer */
			clock_gettime(CLOCK_MONOTONIC, &t4);
			//printf("time for read and process = %jd\n", timediff(&t3,&t4));
      if(timediff(&t3, &t4) > 20000000){
			  printf("clock vlaue = %lu", clockValue);
        printf("time us %llu\n", timediff(&t3,&t4));
        return 1;
      }

			//handles other things not to sure yet
			if (sz == 0)
				break;
			else if (sz == -1) {
				poll(&pollfd, 1, 500);
				continue;
			}

			cnt1 += sz;
		}
#else
		(void)pollfd;
		do {
			sz = read(bfd, buf2, 64 * 1024 * 16);
			if (sz == -1)
				break;
			cnt1 += sz;
		} while (sz > 0 && cnt1 < sz_to_read);
#endif
		cnt += cnt1;
	}

	clock_gettime(CLOCK_MONOTONIC, &t2);

	printf("Read %d bytes in %jd us, speed=%jd MB/s\n",
		cnt, timediff(&t1, &t2), cnt / timediff(&t1, &t2));

	/* Done, close mappings, file and free the buffers */
	beaglelogic_munmap(bfd, bl_mem);
	beaglelogic_close(bfd);

	free(buf);

	return 0;
}
