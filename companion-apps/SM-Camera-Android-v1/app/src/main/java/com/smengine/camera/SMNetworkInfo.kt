package com.smengine.camera

import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections

object SMNetworkInfo {

    fun websocketAddresses(
        port: Int = 8765
    ): List<String> {
        val output =
            mutableListOf<String>()

        try {
            val interfaces =
                Collections.list(
                    NetworkInterface
                        .getNetworkInterfaces()
                )

            for (network in interfaces) {
                if (
                    !network.isUp ||
                    network.isLoopback
                ) {
                    continue
                }

                val addresses =
                    Collections.list(
                        network.inetAddresses
                    )

                for (address in addresses) {
                    if (
                        address is Inet4Address &&
                        !address.isLoopbackAddress
                    ) {
                        val host =
                            address.hostAddress
                                ?: continue

                        output.add(
                            "ws://$host:$port"
                        )
                    }
                }
            }
        } catch (_: Exception) {
        }

        return output.distinct()
    }
}
