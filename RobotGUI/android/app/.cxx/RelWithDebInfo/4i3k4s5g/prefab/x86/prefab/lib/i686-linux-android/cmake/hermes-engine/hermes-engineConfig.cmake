if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/phillipshaw/.gradle/caches/8.12/transforms/f00ae8e4a981a4629fb426cfa436f747/transformed/hermes-android-0.78.0-release/prefab/modules/libhermes/libs/android.x86/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/phillipshaw/.gradle/caches/8.12/transforms/f00ae8e4a981a4629fb426cfa436f747/transformed/hermes-android-0.78.0-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

