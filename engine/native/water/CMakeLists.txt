cmake_minimum_required(VERSION 3.20)

project(sm_water_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT NODE_INCLUDE_DIR)
    message(FATAL_ERROR
        "NODE_INCLUDE_DIR is required. Example: "
        "-DNODE_INCLUDE_DIR=C:/path/to/node/include/node"
    )
endif()

add_library(sm_water_native SHARED
    src/SMWaterCore.cpp
    src/SMWaterNodeAddon.cpp
)

target_include_directories(sm_water_native PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${NODE_INCLUDE_DIR}
)

target_compile_definitions(sm_water_native PRIVATE
    NODE_GYP_MODULE_NAME=sm_water_native
)

if(MSVC)
    target_compile_options(sm_water_native PRIVATE /W4 /EHsc /permissive-)
else()
    target_compile_options(sm_water_native PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(WIN32)
    if(NOT NODE_LIB)
        message(FATAL_ERROR
            "On Windows NODE_LIB is required. Example: "
            "-DNODE_LIB=C:/path/to/node/lib/node.lib"
        )
    endif()
    target_link_libraries(sm_water_native PRIVATE ${NODE_LIB})
endif()

# Node native addons use .node rather than the platform DLL/SO suffix.
set_target_properties(sm_water_native PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

foreach(CONFIG Debug Release RelWithDebInfo MinSizeRel)
    string(TOUPPER "${CONFIG}" CONFIG_UPPER)
    set_target_properties(sm_water_native PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY_${CONFIG_UPPER}
            "${CMAKE_BINARY_DIR}/${CONFIG}"
        LIBRARY_OUTPUT_DIRECTORY_${CONFIG_UPPER}
            "${CMAKE_BINARY_DIR}/${CONFIG}"
    )
endforeach()

set_target_properties(sm_water_native PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release"
)
