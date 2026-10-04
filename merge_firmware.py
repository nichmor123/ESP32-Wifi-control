import os
import csv
Import("env")

def find_partition_csv(env):
    """
    Locates the active partition CSV:
    1. Checks for a custom partition table configured in platformio.ini.
    2. Falls back to the board's default partition file in the framework packages.
    """
    board_config = env.BoardConfig()
    
    # 1. Custom partition CSV specified in platformio.ini (board_build.partitions = ...)
    custom_csv = board_config.get("build.partitions", "")
    if custom_csv:
        # Check project root or relative path
        csv_path = os.path.join(env.subst("$PROJECT_DIR"), custom_csv)
        if os.path.isfile(csv_path):
            return csv_path

    # 2. Board default partition file
    platform = env.PioPlatform()
    framework_dir = platform.get_package_dir("framework-arduinoespressif32")
    
    # Standard Arduino-ESP32 default partition table name
    default_csv_name = board_config.get("build.arduino.partitions", "default.csv")
    
    if framework_dir:
        candidate_path = os.path.join(framework_dir, "tools", "partitions", default_csv_name)
        if os.path.isfile(candidate_path):
            return candidate_path

    return None

def get_filesystem_offset(csv_file_path):
    """
    Parses an ESP-IDF style partition CSV to find the offset for spiffs/littlefs.
    Format: Name, Type, SubType, Offset, Size, Flags
    """
    if not csv_file_path or not os.path.isfile(csv_file_path):
        print(f"[merge_firmware] Warning: Partition CSV not found. Defaulting to 0x290000.")
        return "0x290000"

    with open(csv_file_path, mode="r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            # Ignore empty lines or comments
            if not line or line.startswith("#"):
                continue

            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 4:
                # Name, Type, SubType, Offset
                p_type = parts[1].lower()
                p_subtype = parts[2].lower()
                p_offset = parts[3].lower()

                # LittleFS occupies data partitions tagged as 'spiffs' or 'littlefs'
                if p_type == "data" and p_subtype in ["spiffs", "littlefs"]:
                    # Ensure format starts with 0x
                    if not p_offset.startswith("0x"):
                        p_offset = f"0x{int(p_offset, 16):X}"
                    print(f"[merge_firmware] Found filesystem partition at offset: {p_offset}")
                    return p_offset

    print("[merge_firmware] Warning: No spiffs/littlefs partition found in CSV. Defaulting to 0x290000.")
    return "0x290000"

def merge_bin_action(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    flash_size = env.BoardConfig().get("upload.flash_size", "4MB")
    chip = env.BoardConfig().get("build.mcu", "esp32")
    
    # ESP32 classic uses 0x1000 for bootloader; ESP32-S2/S3/C3/C6 use 0x0
    boot_offset = "0x0" if chip in ["esp32s2", "esp32s3", "esp32c3", "esp32c6"] else "0x1000"
    
    bootloader = os.path.join(build_dir, "bootloader.bin")
    partitions = os.path.join(build_dir, "partitions.bin")
    app = os.path.join(build_dir, "firmware.bin")
    littlefs = os.path.join(build_dir, "littlefs.bin")
    merged = os.path.join(build_dir, "merged-firmware.bin")

    # Locate and parse partition table dynamically
    csv_file = find_partition_csv(env)
    fs_offset = get_filesystem_offset(csv_file)

    # Locate PlatformIO's packaged esptool.py executable
    platform = env.PioPlatform()
    esptool_pkg = platform.get_package_dir("tool-esptoolpy")
    esptool_path = os.path.join(esptool_pkg, "esptool.py")

    cmd = [
        f'"{env.subst("$PYTHONEXE")}"',
        f'"{esptool_path}"',
        "--chip", chip,
        "merge_bin",
        "-o", f'"{merged}"',
        "--flash_mode", "dio",
        "--flash_size", flash_size,
        boot_offset, f'"{bootloader}"',
        "0x8000", f'"{partitions}"',
        "0x10000", f'"{app}"',
        fs_offset, f'"{littlefs}"'
    ]

    env.Execute(" ".join(cmd))

# Register custom target: pio run -t merge
env.AddCustomTarget(
    name="merge",
    dependencies=["$BUILD_DIR/firmware.bin", "$BUILD_DIR/littlefs.bin"],
    actions=[merge_bin_action],
    title="Merge Binary",
    description="Generate a single combined binary with dynamic LittleFS offset"
)