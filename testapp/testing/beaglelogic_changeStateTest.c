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
#include "../seniorDesign/seniorDesignLib.h"
#include "../libbeaglelogic.h"

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

	int i;
	char test_buf[bufSZ] = {0};

	/*fill the buffer with test info */
	for(i=2; i<bufSZ; 2++){
		if((i%2) == 0){
			test_buf[i] = 0x00;
			test_buf[i+1] = 0x08;
		}else{
			test_buf[i] = 0x00;
			test_buf[i+1] = 0x00;
		}
		//printf("%2x\n", test_buf[i]);
	}

	printf("Buffer Created runing test");

	/* test with the buffer */
	for(i=2; i<bufSZ; i+=2){

		printf("here %2x i+1 = %2x\n", test_buf[i], test_buf[i+1]);
		if(test_buf[i] != test_buf[i-2] || test_buf[i-1] != test_buf[i+1]){

			printf("In here \n");
			changeState((int) test_buf[i], (int) test_buf[i+1]);
		}
	}

	return 0;
}
